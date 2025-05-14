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
		"Budget Operations",
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
			"group_index",
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
		expense_doc = frappe.get_doc("Expense Items", link)
		available_items.append(
			{
				"name": expense_doc.name,
				"is_transit": expense_doc.is_transit,
				"priority": expense_doc.priority,
				"entry_type": expense_doc.entry_type,
				"is_read_only": expense_doc.is_read_only,
			}
		)
	available_items.sort(key=lambda x: x["priority"])
	return available_items


def build_columns_and_headers(operation_type_names, available_expense_items, organization_bank_rules_names):
	"""
	Строит базовые заголовки и описание колонок для Handsontable.

	Возвращает кортеж (colHeaders, columns), где:
	  colHeaders - список заголовков,
	  columns - список описаний колонок (тип, формат, настройки).
	"""
	colHeaders = [_("Date"), _("Budget Operation Type"), _("Group Index")]
	columns = [
		{
			"field": "date",
			"label": _("Date"),
			"type": "date",
			"dateFormat": "YYYY-MM-DD",
			"correctFormat": True,
			"allowInvalid": False,
			"readOnly": True,
			"className": "htCenter htMiddle",
		},
		{
			"field": "budget_operation_type",
			"label": _("Budget Operation Type"),
			"type": "dropdown",
			"source": operation_type_names,
			"readOnly": True,
			"className": "htCenter htMiddle",
		},
		{
			"field": "group_index",
			"label": _("Group Index"),
			"type": "numeric",
			"readOnly": True,
			"className": "htCenter htMiddle",
			"numericFormat": {
				"pattern": "0,0.00",
			},
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
				"className": "htCenter htRight",
				"numericFormat": {
					"pattern": "0,0.00",
				},
				"readOnly": expense["is_read_only"],
			}
		)

		if expense["entry_type"] == "Balance":
			continue

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
					"className": "htCenter htMiddle",
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
				"className": "htLeft",
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
				"className": "htLeft",
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
				"readOnly": True,
				"className": "htCenter htMiddle",
			}
		)

	return colHeaders, columns


def build_field_to_index(columns):
	"""
	Создаёт маппинг, сопоставляющий имя поля индексу колонки.
	"""
	return {col["field"]: idx for idx, col in enumerate(columns)}


def create_empty_row(date_str, op_type, field_to_index, num_columns, group_index=0):
	"""
	Создаёт пустую строку с заданными базовыми значениями: датой и типом операции.
	"""
	row = [None] * num_columns
	row[field_to_index["date"]] = date_str
	row[field_to_index["budget_operation_type"]] = op_type
	row[field_to_index["group_index"]] = group_index
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
def get_budget_plannig_data_for_handsontable(organization_bank_rule_name, number_of_days):
	result = {"data": [], "colHeaders": [], "columns": [], "operationTypeNames": []}

	DAYS = int(number_of_days)
	today = date.today()
	start_date, end_date = today - timedelta(days=DAYS), today + timedelta(days=DAYS)
	dates = get_date_range(start_date, end_date)

	# Получаем исходные данные и метаданные
	budget_ops = fetch_budget_operations(organization_bank_rule_name, start_date, end_date)
	types = frappe.get_list("Budget Operation Types", fields=["type_name"], order_by="priority asc")
	types = [t["type_name"] for t in types]
	rules = frappe.get_list("Organization-Bank Rules", fields=["name"], order_by="creation asc")
	rules = [r["name"] for r in rules]
	items = get_available_expense_items(organization_bank_rule_name)

	# Заголовки и колонки
	colHeaders, columns = build_columns_and_headers(types, items, rules)
	result.update({"colHeaders": colHeaders, "columns": columns, "operationTypeNames": types})
	idx_map = build_field_to_index(columns)
	num_cols = len(columns)

	# Группируем по (date, type)
	grouped = {}
	for op in budget_ops:
		key = (op["date"], op["budget_operation_type"])
		grouped.setdefault(key, []).append(op)

	# Основная логика: для каждой пары (dt, type) создаём ровно
	# max(group_index)+1 строк и заполняем их по индексу
	for dt in dates:
		for t in types:
			key = (dt, t)
			ops_list = grouped.get(key, [])

			if ops_list:
				# узнаём, сколько строк нужно: от 0 до max(group_index)
				max_idx = max(op.get("group_index", 0) for op in ops_list)
				rows_for_key = []
				# инициализируем пустые строки с нужным group_index
				for gi in range(0, max_idx + 1):
					rows_for_key.append(create_empty_row(dt, t, idx_map, num_cols, gi))
				# заполняем каждую строку по её group_index
				for op in ops_list:
					gi = op.get("group_index", 0)
					fill_row_from_op(rows_for_key[gi], op, idx_map)
				# добавляем все заполненные ряды
				result["data"].extend(rows_for_key)
			else:
				# ни одной операции — одна пустая строка с group_index=0
				result["data"].append(create_empty_row(dt, t, idx_map, num_cols, 0))

	return result


@frappe.whitelist()
def save_budget_changes(organization_bank_rule_name, changes):
	"""
	Принимает список изменений с полями:
	        name, date, budget_type, expense_item,
	        sum, recipient_of_transit_payment,
	        description, comment, group_index

	Создаёт новые Budget operation с вычисленным group_index,
	а для существующих записей group_index не меняет.
	"""
	import json

	from frappe.utils import flt

	# Разбираем пришедший JSON
	try:
		changes = json.loads(changes)
	except ValueError:
		changes = []

	for ch in changes:
		date = ch.get("date")
		op_type = ch.get("budget_type")
		expense_item = ch.get("expense_item") or ""
		value_sum = ch.get("sum")
		transit = ch.get("recipient_of_transit_payment")
		desc = ch.get("description")
		comm = ch.get("comment")
		name = ch.get("name")
		group_index = ch.get("group_index")

		# Если добавляют "пустую" строку (expense_item пуст)
		# и для этой date/op_type ещё нет записей — создаём сразу две пустые строки
		if not expense_item:
			existing_count = frappe.db.count(
				"Budget Operations",
				{
					"date": date,
					"budget_operation_type": op_type,
					"organization_bank_rule": organization_bank_rule_name,
				},
			)
			if existing_count == 0:
				for idx in (0, 1):
					new_doc = frappe.new_doc("Budget Operations")
					new_doc.date = date
					new_doc.budget_operation_type = op_type
					new_doc.organization_bank_rule = organization_bank_rule_name
					new_doc.expense_item = ""
					new_doc.group_index = idx
					new_doc.sum = flt(0)
					new_doc.recipient_of_transit_payment = ""
					new_doc.description = ""
					new_doc.comment = ""
					new_doc.save(ignore_permissions=True)
				# пропускаем дальнейшую обработку этой "пустой" строки
				continue

		# Найдём или создадим документ
		doc = None
		if name:
			try:
				doc = frappe.get_doc("Budget Operations", name)
			except frappe.DoesNotExistError:
				doc = None

		# Если запись не найдена — создаём новую
		if not doc:
			# Если group_index не задан, вычисляем новый
			if group_index is None:
				existing = frappe.get_all(
					"Budget Operations",
					filters={
						"date": date,
						"budget_operation_type": op_type,
						"organization_bank_rule": organization_bank_rule_name,
					},
					fields=["group_index"],
				)
				idxs = [op.get("group_index") for op in existing if op.get("group_index") is not None]
				group_index = max(idxs) + 1 if idxs else 0

			doc = frappe.new_doc("Budget Operations")
			doc.date = date
			doc.budget_operation_type = op_type
			doc.organization_bank_rule = organization_bank_rule_name
			doc.expense_item = expense_item
			doc.group_index = group_index

		# Записываем остальные поля
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


def publish_budget_change_by_update_budget_operation(doc, method):
	organization_bank_rule_name = doc.get("organization_bank_rule")
	if not organization_bank_rule_name:
		return
	publish_budget_change(organization_bank_rule_name)


def publish_budget_change_by_update_organization(doc, method):
	rules = frappe.get_all("Organization-Bank Rules", filters={"organization": doc.name}, pluck="name")
	for rule in rules:
		publish_budget_change(rule)


def publish_budget_change_by_update_bank(doc, method):
	rules = frappe.get_all("Organization-Bank Rules", filters={"bank": doc.name}, pluck="name")
	for rule in rules:
		publish_budget_change(rule)


def publish_budget_change_by_update_expense_item(doc, method):
	links = frappe.get_all("Organization-Bank Rules", filters={"link_expense_item": doc.name}, pluck="name")
	for rule in links:
		publish_budget_change(rule)


def publish_budget_change_by_update_organization_bank_rule(doc, method):
	publish_budget_change(doc.name)
