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
		fields=[
			"name",
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
			"type": "dropdown",
			"source": operation_type_names,
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

		# Колонка для name (идентификатор)
		comm_label = _("{0} Name").format(name)
		colHeaders.append(comm_label)
		columns.append(
			{
				"field": f"{name}_name",
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
	row = [None] * num_columns
	row[field_to_index["date"]] = date_str
	row[field_to_index["budget_operation_type"]] = op_type
	return row


def fill_row_from_op(row, op, field_to_index):
	"""
	Дополняет переданную строку row данными операции op.

	row             — список значений (строка таблицы), который уже содержит
	                  date и budget_operation_type.
	op              — словарь с полями операции, включая:
	                  "expense_item", "sum", "recipient_of_transit_payment",
	                  "description", "comment", "name".
	field_to_index  — маппинг field_name → индекс колонки в row.

	Возвращает ту же строку row, но с подставленными значениями из op.
	"""
	base = op.get("expense_item")
	if not base:
		return row

	# Сумма
	if base in field_to_index:
		row[field_to_index[base]] = op.get("sum", row[field_to_index[base]])

	# Transit
	tfield = f"{base}_transit"
	if tfield in field_to_index:
		row[field_to_index[tfield]] = op.get("recipient_of_transit_payment", row[field_to_index[tfield]])

	# Description
	dfield = f"{base}_description"
	if dfield in field_to_index:
		row[field_to_index[dfield]] = op.get("description", row[field_to_index[dfield]])

	# Comment
	cfield = f"{base}_comment"
	if cfield in field_to_index:
		row[field_to_index[cfield]] = op.get("comment", row[field_to_index[cfield]])

	# Name (идентификатор)
	nfield = f"{base}_name"
	if nfield in field_to_index:
		row[field_to_index[nfield]] = op.get("name", row[field_to_index[nfield]])

	return row


@frappe.whitelist()
def get_budget_plannig_data_for_handsontable(organization_bank_rule_name):
	result = {"data": [], "colHeaders": [], "columns": [], "operationTypeNames": []}

	DAYS = 7
	today = date.today()
	start_date, end_date = today - timedelta(days=DAYS), today + timedelta(days=DAYS)
	dates = get_date_range(start_date, end_date)

	# Получаем исходные данные и метаданные
	budget_ops = fetch_budget_operations(organization_bank_rule_name, start_date, end_date)
	types = frappe.get_list("Budget operation types", fields=["type_name"], order_by="priority asc")
	types = [t["type_name"] for t in types]
	rules = frappe.get_list("Organization-Bank Rules", fields=["name"], order_by="creation asc")
	rules = [r["name"] for r in rules]
	items = get_available_expense_items(organization_bank_rule_name)

	# Заголовки и колонки
	colHeaders, columns = build_columns_and_headers(types, items, rules)
	result.update({"colHeaders": colHeaders, "columns": columns, "operationTypeNames": types})

	# Индексы для полей
	idx_map = build_field_to_index(columns)
	num_cols = len(columns)

	# Группируем по (date,type)
	grouped = {}
	for op in budget_ops:
		key = (op["date"], op["budget_operation_type"])
		grouped.setdefault(key, []).append(op)

	# Формируем строки: если несколько ops под одним key — выдаем несколько строк
	for dt in dates:
		for t in types:
			key = (dt, t)
			ops_list = grouped.get(key, [])

			# Список строк для этой комбинации (date, type)
			rows_for_key = []

			# Проходим по всем операциям
			for op in ops_list:
				placed = False
				# Ищем существующую строку с пустым местом для этого expense_item
				for row in rows_for_key:
					if op["expense_item"] == "":
						break
					if row[idx_map[op["expense_item"]]] is None:
						# дополняем найденную строку
						fill_row_from_op(row, op, idx_map)
						placed = True
						break

				if not placed:
					# ни в одной из существующих строк нет свободного места — создаём новую
					new_row = create_empty_row(dt, t, idx_map, num_cols)
					fill_row_from_op(new_row, op, idx_map)
					rows_for_key.append(new_row)

			if rows_for_key:
				# добавляем все заполненные строки
				result["data"].extend(rows_for_key)
			else:
				# если операций нет — одна пустая строка
				result["data"].append(create_empty_row(dt, t, idx_map, num_cols))

	return result


@frappe.whitelist()
def save_budget_changes(organization_bank_rule_name, changes):
	"""
	Принимает список изменений с полями:
	  name, date, budget_type, expense_item,
	  sum, recipient_of_transit_payment,
	  description, comment
	Обновляет существующие Budget operation или создаёт новые.
	"""
	import json

	from frappe.utils import flt

	# changes уже приходит как list[dict], не нужно json.loads
	changes = json.loads(changes)

	for ch in changes:
		# ch теперь dict, а не строка
		date = ch.get("date")
		op_type = ch.get("budget_type")
		expense_item = ch.get("expense_item")
		value_sum = ch.get("sum")
		transit = ch.get("recipient_of_transit_payment")
		desc = ch.get("description")
		comm = ch.get("comment")
		name = ch.get("name")

		# Попытаться загрузить по имени, если передан
		doc = None
		if name:
			try:
				doc = frappe.get_doc("Budget operation", name)
			except frappe.DoesNotExistError:
				doc = None

		# Если не нашли — создаём новую
		if not doc:
			doc = frappe.new_doc("Budget operation")
			doc.date = date
			doc.budget_operation_type = op_type
			doc.organization_bank_rule = organization_bank_rule_name
			doc.expense_item = expense_item

		# Записываем поля
		doc.sum = flt(value_sum or 0)
		doc.recipient_of_transit_payment = transit or ""
		doc.description = desc or ""
		doc.comment = comm or ""
		doc.save(ignore_permissions=True)

	return {"success": True}


def publish_budget_change(organization_bank_rule_name):
	channel = "budget_data_updated"
	frappe.publish_realtime(
		event=channel, message={"organization_bank_rule_name": organization_bank_rule_name}, user=None
	)


def publish_budget_change_by_doc(doc, method):
	organization_bank_rule_name = doc.get("organization_bank_rule")
	if not organization_bank_rule_name:
		return
	publish_budget_change(organization_bank_rule_name)
