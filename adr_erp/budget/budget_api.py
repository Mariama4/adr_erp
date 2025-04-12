from datetime import date, timedelta

import frappe
from frappe import _


def get_date_range(start_date, end_date):
	"""
	Возвращает список дат в формате YYYY-MM-DD между start_date и end_date (включительно).
	"""
	num_days = (end_date - start_date).days + 1
	return [(start_date + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(num_days)]


def fetch_budget_operations(organization_bank_rule_name, start_date, end_date):
	"""
	Получает бюджетные операции с БД за указанный период и приводит данные к необходимому виду.
	"""
	ops = frappe.db.get_list(
		"Budget operation",
		filters=[
			["date", ">=", start_date.strftime("%Y-%m-%d")],
			["date", "<=", end_date.strftime("%Y-%m-%d")],
			["organization_bank_rule", "=", organization_bank_rule_name],
		],
		order_by="date asc",
		fields=[
			"date",
			"budget_operation_type",  # исправлено: используется поле "budget_operation_type" вместо "type"
			"organization_bank_rule",
			"sum",
			"expense_item",
			"recipient_of_transit_payment",
			"description",
			"comment",
		],
	)
	for op in ops:
		# Приводим дату к строковому формату
		op["date"] = op["date"].strftime("%Y-%m-%d")
		# Если поле пустое, заменяем на пустую строку
		for field in ("expense_item", "description", "comment", "recipient_of_transit_payment"):
			op[field] = op.get(field) or ""
	return ops


def get_operation_types():
	"""
	Получает список названий типов бюджетных операций в отсортированном порядке.
	"""
	op_types = frappe.get_list("Budget operation types", fields=["type_name"], order_by="priority asc")
	return [op["type_name"] for op in op_types]


def get_bank_rules():
	"""
	Возвращает список имён правил для банка (Organization-Bank Rules).
	"""
	bank_rules = frappe.get_list("Organization-Bank Rules", fields=["name"], order_by="creation asc")
	return [br["name"] for br in bank_rules]


def get_available_expense_items(org_bank_rule_name):
	"""
	Получает список доступных expense item'ов из документа Organization-Bank Rules.
	"""
	doc = frappe.get_doc("Organization-Bank Rules", org_bank_rule_name)
	available_items = []
	for item in doc.available_expense_items:
		link = item.get("link_expense_item")
		expense_doc = frappe.get_doc("Expense item", link)
		available_items.append({"name": expense_doc.name, "is_transit": expense_doc.is_transit})
	return available_items


def build_columns_and_headers(operation_type_names, available_expense_items, organization_bank_rules_names):
	"""
	Строит базовые заголовки и описание колонок для Handsontable.

	Возвращает кортеж (colHeaders, columns), где:
	  colHeaders - список заголовков,
	  columns - список описаний колонок (тип, формат, настройки).
	"""
	colHeaders = [_("Date"), _("Budget Operation Type")]
	columns = [
		{
			"field": "date",
			"label": _("Date"),
			"type": "date",
			"dateFormat": "YYYY-MM-DD",
			"correctFormat": True,
			"allowInvalid": False,
		},
		{
			"field": "budget_operation_type",
			"label": _("Budget Operation Type"),
			"type": "select",
			"selectOptions": operation_type_names,
		},
	]

	# Добавляем колонки для каждого expense item:
	# сумма, транзит (если применимо), описание и комментарий.
	for expense in available_expense_items:
		name = expense["name"]

		# Колонка для суммы
		colHeaders.append(name)
		columns.append(
			{
				"field": name,
				"label": name,
				"type": "numeric",
				"allowInvalid": False,
			}
		)

		# Если expense item имеет транзитный флаг, добавляем колонку для транзитного платежа.
		if expense["is_transit"]:
			transit_label = _("{0} Transit").format(name)
			colHeaders.append(transit_label)
			columns.append(
				{
					"field": f"{name}_transit",
					"label": transit_label,
					"type": "dropdown",
					"source": organization_bank_rules_names,
				}
			)

		# Колонка для описания
		desc_label = _("{0} Description").format(name)
		colHeaders.append(desc_label)
		columns.append(
			{
				"field": f"{name}_description",
				"label": desc_label,
				"type": "text",
			}
		)

		# Колонка для комментария
		comm_label = _("{0} Comment").format(name)
		colHeaders.append(comm_label)
		columns.append(
			{
				"field": f"{name}_comment",
				"label": comm_label,
				"type": "text",
			}
		)

	return colHeaders, columns


def build_field_to_index(columns):
	"""
	Создаёт маппинг, сопоставляющий имя поля индексу колонки.
	"""
	return {col["field"]: idx for idx, col in enumerate(columns)}


def create_empty_row(date_str, op_type, field_to_index, num_columns):
	"""
	Создаёт пустую строку с заданными базовыми значениями: датой и типом операции.
	"""
	row = ["" for _ in range(num_columns)]
	row[field_to_index["date"]] = date_str
	row[field_to_index["budget_operation_type"]] = op_type
	return row


def group_operations(budget_ops, field_to_index, num_columns):
	"""
	Группирует операции по ключу (date, budget_operation_type) и заполняет соответствующие колонки.

	Возвращает словарь, где ключ — кортеж (дата, тип операции), а значение — сформированная строка.
	"""
	grouped = {}
	for op in budget_ops:
		key = (op["date"], op["budget_operation_type"])
		if key not in grouped:
			grouped[key] = create_empty_row(
				op["date"], op["budget_operation_type"], field_to_index, num_columns
			)
		exp_name = op.get("expense_item")
		if exp_name and (exp_name in field_to_index):
			# Обновляем колонку суммы
			grouped[key][field_to_index[exp_name]] = op.get("sum")
			# Обновляем колонку транзит, если таковая определена
			transit_field = f"{exp_name}_transit"
			if transit_field in field_to_index:
				grouped[key][field_to_index[transit_field]] = op.get("recipient_of_transit_payment")
			# Обновляем колонку описания
			desc_field = f"{exp_name}_description"
			if desc_field in field_to_index:
				grouped[key][field_to_index[desc_field]] = op.get("description")
			# Обновляем колонку комментария
			comm_field = f"{exp_name}_comment"
			if comm_field in field_to_index:
				grouped[key][field_to_index[comm_field]] = op.get("comment")
	return grouped


@frappe.whitelist()
def get_budget_plannig_data_for_handsontable(organization_bank_rule_name):
	"""
	Возвращает данные бюджетных операций для Handsontable.

	Результирующий словарь содержит:
	  - data: список строк с данными,
	  - colHeaders: заголовки колонок,
	  - columns: описание колонок (формат, тип и пр.).
	"""
	result = {
		"data": [],
		"colHeaders": [],
		"columns": [],
	}

	DAYS = 7
	current_date = date.today()
	start_date = current_date - timedelta(days=DAYS)
	end_date = current_date + timedelta(days=DAYS)

	# Получаем диапазон дат
	date_range = get_date_range(start_date, end_date)

	# Получаем данные
	budget_ops = fetch_budget_operations(organization_bank_rule_name, start_date, end_date)
	operation_type_names = get_operation_types()
	organization_bank_rules_names = get_bank_rules()
	available_expense_items = get_available_expense_items(organization_bank_rule_name)

	# Формируем заголовки и колонки
	colHeaders, columns = build_columns_and_headers(
		operation_type_names, available_expense_items, organization_bank_rules_names
	)
	result["colHeaders"] = colHeaders
	result["columns"] = columns

	# Создаём маппинг для быстрого доступа к индексам колонок
	field_to_index = build_field_to_index(columns)
	num_columns = len(colHeaders)

	# Группируем бюджетные операции по (дата, бюджет_operation_type)
	grouped_ops = group_operations(budget_ops, field_to_index, num_columns)

	# Формируем итоговые данные: для каждой даты и для каждого типа операции
	for dt in date_range:
		for op_type in operation_type_names:
			key = (dt, op_type)
			if key in grouped_ops:
				result["data"].append(grouped_ops[key])
			else:
				result["data"].append(create_empty_row(dt, op_type, field_to_index, num_columns))

	return result
