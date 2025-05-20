import json
from datetime import date, datetime, timedelta

import frappe
import pytz
from frappe import _
from frappe.utils import flt


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

	colHeaders.extend([_("Balance"), _("Remaining"), _("Transfer"), _("Movement")])
	columns.extend(
		[
			{
				"field": "balance",
				"label": _("Balance"),
				"type": "numeric",
				"allowInvalid": False,
				"className": "htCenter htMiddle",
				"numericFormat": {
					"pattern": "0,0.00",
				},
				"readOnly": True,
			},
			{
				"field": "remaining",
				"label": _("Remaining"),
				"type": "numeric",
				"allowInvalid": False,
				"className": "htCenter htMiddle",
				"numericFormat": {
					"pattern": "0,0.00",
				},
				"readOnly": True,
			},
			{
				"field": "transfer",
				"label": _("Transfer"),
				"type": "numeric",
				"allowInvalid": False,
				"className": "htCenter htMiddle",
				"numericFormat": {
					"pattern": "0,0.00",
				},
				"readOnly": True,
			},
			{
				"field": "movement",
				"label": _("Movement"),
				"type": "numeric",
				"allowInvalid": False,
				"className": "htCenter htMiddle",
				"numericFormat": {
					"pattern": "0,0.00",
				},
				"readOnly": True,
			},
		]
	)

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

	# 4) Одинарный запрос за движениями из Movements of Budget Operations
	moves = frappe.get_all(
		"Movements of Budget Operations",
		filters=[
			["organization_bank_rule", "=", organization_bank_rule_name],
			["date", ">=", start_date.strftime("%Y-%m-%d")],
			["date", "<=", end_date.strftime("%Y-%m-%d")],
		],
		fields=["date", "budget_balance_type", "sum"],
	)
	# 5) Построить словарь: (date, balance_type) → sum
	moves_map = {(m.date.strftime("%Y-%m-%d"), m.budget_balance_type): m.sum for m in moves}

	# 6) Для каждого dt и каждого типа строим строки
	for dt in dates:
		for t in types:
			key = (dt, t)
			ops_list = grouped.get(key, [])
			# читаем суммы из словаря (или 0 если нет)
			bal = moves_map.get((dt, "Balance"), 0.0)
			rem = moves_map.get((dt, "Remaining"), 0.0)
			trf = moves_map.get((dt, "Transfer"), 0.0)
			mov = moves_map.get((dt, "Movement"), 0.0)

			if ops_list:
				max_idx = max(op.get("group_index", 0) for op in ops_list)
				# создаём строк по каждому group_index
				rows_for_key = [create_empty_row(dt, t, idx_map, num_cols, gi) for gi in range(max_idx + 1)]
				# сначала проставляем четыре метрики во все строки
				for row in rows_for_key:
					row[idx_map["balance"]] = bal
					row[idx_map["remaining"]] = rem
					row[idx_map["transfer"]] = trf
					row[idx_map["movement"]] = mov
				# потом раскладываем expense_item по своим строкам
				for op in ops_list:
					gi = op.get("group_index", 0)
					fill_row_from_op(rows_for_key[gi], op, idx_map)
				result["data"].extend(rows_for_key)
			else:
				# ни одной операции — одна пустая строка + метрики
				empty = create_empty_row(dt, t, idx_map, num_cols, 0)
				empty[idx_map["balance"]] = bal
				empty[idx_map["remaining"]] = rem
				empty[idx_map["transfer"]] = trf
				empty[idx_map["movement"]] = mov
				result["data"].append(empty)

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

	def parse_changes(changes_json):
		try:
			return json.loads(changes_json)
		except ValueError:
			return []

	def count_ops(filters):
		return frappe.db.count("Budget Operations", filters)

	def get_group_indices(target_date):
		ops = frappe.get_all(
			"Budget Operations",
			filters={"date": target_date, "organization_bank_rule": organization_bank_rule_name},
			fields=["group_index"],
		)
		return [op.group_index for op in ops if op.group_index is not None]

	def next_group_index(target_date):
		idxs = get_group_indices(target_date)
		return max(idxs) + 1 if idxs else 0

	def create_op(target_date, op_type, expense_item, group_index):
		doc = frappe.new_doc("Budget Operations")
		doc.date = target_date
		doc.budget_operation_type = op_type
		doc.organization_bank_rule = organization_bank_rule_name
		doc.expense_item = expense_item
		doc.group_index = group_index
		doc.sum = flt(0)
		doc.recipient_of_transit_payment = ""
		doc.description = ""
		doc.comment = ""
		doc.save()
		return doc

	def handle_empty_change(target_date, op_type):
		# если expense_item == ""
		# 1) при отсут. любых записей – создаём пару план/факт с group_index=0
		if count_ops({"date": target_date, "organization_bank_rule": organization_bank_rule_name}) == 0:
			create_op(target_date, "План", "", 0)
			create_op(target_date, "Факт", "", 0)

		# 2) создаём пустые на новом group_index
		gi = next_group_index(target_date)
		if op_type == "План":
			create_op(target_date, "План", "", gi)
			create_op(target_date, "Факт", "", gi)
		else:
			create_op(target_date, "Факт", "", gi)

	def find_existing_doc(name, target_date=None, op_type=None, group_index=None):
		try:
			return frappe.get_doc("Budget Operations", name)
		except frappe.DoesNotExistError:
			return None
		except frappe.NotFound:
			return None

	def find_existing_empty_doc(target_date, organization_bank_rule_name, op_type, group_index):
		names = frappe.get_all(
			"Budget Operations",
			filters={
				"date": target_date,
				"budget_operation_type": op_type,
				"organization_bank_rule": organization_bank_rule_name,
				"group_index": group_index,
				"expense_item": "",  # empty string, а не None
			},
			limit=1,
			pluck="name",
		)
		if names:
			# теперь уже безопасно получаем doc по имени
			return frappe.get_doc("Budget Operations", names[0])
		return None

	def handle_non_empty_change(ch):
		target_date = ch["date"]
		op_type = ch["budget_type"]
		expense_item = ch["expense_item"]
		name = ch.get("name")
		group_index = ch.get("group_index")

		doc = (
			find_existing_doc(name, target_date, op_type, group_index)
			if name
			else find_existing_empty_doc(target_date, organization_bank_rule_name, op_type, group_index)
		)

		if not doc:
			# вычисляем новый group_index, если не задан
			if group_index is None:
				# только для этого date+type
				idxs = frappe.get_all(
					"Budget Operations",
					filters={
						"date": target_date,
						"budget_operation_type": op_type,
						"organization_bank_rule": organization_bank_rule_name,
					},
					fields=["group_index"],
				)
				idxs = [o.group_index for o in idxs if o.group_index is not None]
				group_index = max(idxs) + 1 if idxs else 0

			doc = frappe.new_doc("Budget Operations")
			doc.date = target_date
			doc.budget_operation_type = op_type
			doc.organization_bank_rule = organization_bank_rule_name
			doc.group_index = group_index

		# пишем остальные поля
		doc.expense_item = expense_item
		doc.sum = flt(ch.get("sum") or 0)
		doc.recipient_of_transit_payment = ch.get("recipient_of_transit_payment") or ""
		doc.description = ch.get("description") or ""
		doc.comment = ch.get("comment") or ""
		doc.save()

		# если это План – убеждаемся, что для того же group_index есть Факт
		if doc.budget_operation_type == "План":
			exists = frappe.get_all(
				"Budget Operations",
				filters={
					"date": target_date,
					"budget_operation_type": "Факт",
					"organization_bank_rule": organization_bank_rule_name,
					"group_index": doc.group_index,
				},
				limit=1,
			)
			if not exists:
				create_op(target_date, "Факт", "", doc.group_index)

	# --- основная логика ---
	for ch in parse_changes(changes):
		target_date = ch.get("date")
		op_type = ch.get("budget_type")
		expense_item = ch.get("expense_item") or ""

		if expense_item == "":
			handle_empty_change(target_date, op_type)
		else:
			handle_non_empty_change(ch)

	return {"success": True}


def publish_budget_change(organization_bank_rule_name):
	channel = "budget_data_updated"
	frappe.publish_realtime(
		event=channel, message={"organization_bank_rule_name": organization_bank_rule_name}, user=None
	)


def publish_budget_page_refresh():
	channel = "require_budget-operations-excel-editor_refresh"
	frappe.publish_realtime(event=channel, message={}, user=None)


# 1
def calculate_remaining_type_movement_of_budget_operations(organization_bank_rule_name, target_date):
	previous_target_date = target_date - timedelta(1)
	rows = frappe.get_all(
		"Movements of Budget Operations",
		filters={
			"organization_bank_rule": organization_bank_rule_name,
			"date": previous_target_date,
			"budget_balance_type": "Balance",
		},
		fields=["name", "sum"],
		limit_page_length=1,
	)
	if rows:
		row = rows[0]
		return {
			"used_movement_budget_operation": [row],
			"current_budget_operations_remainings": flt(row.get("sum") or 0),
		}
	else:
		return {"used_movement_budget_operation": [], "current_budget_operations_remainings": 0.0}


# 2
def calculate_movement_type_movement_of_budget_operations(organization_bank_rule_name, target_date):
	today_msk = datetime.now(pytz.timezone("Europe/Moscow")).date()

	current_budget_operations_movements = 0
	used_budget_operations = []

	if target_date > today_msk:
		budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["organization_bank_rule", "=", organization_bank_rule_name],
				["date", "=", target_date],
				["sum", ">", 0],
				["budget_operation_type", "=", "План"],
			],
			fields=[
				"name",
				"date",
				"budget_operation_type",
				"organization_bank_rule",
				"sum",
				"expense_item",
				"recipient_of_transit_payment",
				"group_index",
			],
		)
		for budget_operation in budget_operations:
			# План
			entry_type = frappe.get_value("Expense items", budget_operation.expense_item, "entry_type")
			if entry_type == "Debit":
				current_budget_operations_movements += budget_operation.sum
			elif entry_type == "Credit":
				current_budget_operations_movements -= budget_operation.sum
			used_budget_operations.append(budget_operation)
	elif target_date < today_msk:
		budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["organization_bank_rule", "=", organization_bank_rule_name],
				["date", "=", target_date],
				["sum", ">", 0],
				["budget_operation_type", "=", "Факт"],
			],
			fields=[
				"name",
				"date",
				"budget_operation_type",
				"organization_bank_rule",
				"sum",
				"expense_item",
				"recipient_of_transit_payment",
				"group_index",
			],
		)
		for budget_operation in budget_operations:
			# Факт
			entry_type = frappe.get_value("Expense items", budget_operation.expense_item, "entry_type")
			if entry_type == "Debit":
				current_budget_operations_movements += budget_operation.sum
			elif entry_type == "Credit":
				current_budget_operations_movements -= budget_operation.sum
			used_budget_operations.append(budget_operation)
	else:
		grouped_budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["organization_bank_rule", "=", organization_bank_rule_name],
				["date", "=", target_date],
				["sum", ">", 0],
			],
			fields=[
				"expense_item",
				"group_index",
			],
			distinct=True,
		)
		for group_budget_operation in grouped_budget_operations:
			budget_operations = frappe.get_all(
				"Budget Operations",
				filters=[
					["organization_bank_rule", "=", organization_bank_rule_name],
					["date", "=", target_date],
					["sum", ">", 0],
					["expense_item", "=", group_budget_operation.expense_item],
					["group_index", "=", group_budget_operation.group_index],
				],
				fields=[
					"name",
					"date",
					"budget_operation_type",
					"organization_bank_rule",
					"sum",
					"expense_item",
					"recipient_of_transit_payment",
					"group_index",
				],
			)
			allowed_budget_operation_type = (
				"Факт"
				if any(
					[
						budget_operation.budget_operation_type == "Факт"
						for budget_operation in budget_operations
					]
				)
				is True
				else "План"
			)
			for budget_operation in budget_operations:
				if budget_operation.budget_operation_type == allowed_budget_operation_type:
					entry_type = frappe.get_value(
						"Expense items", budget_operation.expense_item, "entry_type"
					)
					if entry_type == "Debit":
						current_budget_operations_movements += budget_operation.sum
					elif entry_type == "Credit":
						current_budget_operations_movements -= budget_operation.sum
					used_budget_operations.append(budget_operation)

	return {
		"current_budget_operations_movements": current_budget_operations_movements,
		"used_budget_operations": used_budget_operations,
	}


# 3
def calculate_transfer_type_movement_of_budget_operations(organization_bank_rule_name, target_date):
	# так как изменяю другие organization_bank_rule_name, нужно будет находить их и так же все пересчитывать
	today_msk = datetime.now(pytz.timezone("Europe/Moscow")).date()

	current_budget_operations_transfers = 0
	used_budget_operations = []

	if target_date > today_msk:
		budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["date", "=", target_date],
				["sum", ">", 0],
				["budget_operation_type", "=", "План"],
				["recipient_of_transit_payment", "=", "organization_bank_rule_name"],
			],
			fields=[
				"name",
				"date",
				"budget_operation_type",
				"organization_bank_rule",
				"sum",
				"expense_item",
				"recipient_of_transit_payment",
				"group_index",
			],
		)
		for budget_operation in budget_operations:
			# План
			current_budget_operations_transfers += budget_operation.sum
			used_budget_operations.append(budget_operation)
	elif target_date < today_msk:
		budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["date", "=", target_date],
				["sum", ">", 0],
				["budget_operation_type", "=", "Факт"],
				["recipient_of_transit_payment", "=", organization_bank_rule_name],
			],
			fields=[
				"name",
				"date",
				"budget_operation_type",
				"organization_bank_rule",
				"sum",
				"expense_item",
				"recipient_of_transit_payment",
				"group_index",
			],
		)
		for budget_operation in budget_operations:
			# Факт
			current_budget_operations_transfers += budget_operation.sum
			used_budget_operations.append(budget_operation)
	else:
		grouped_budget_operations = frappe.get_all(
			"Budget Operations",
			filters=[
				["date", "=", target_date],
				["sum", ">", 0],
				["recipient_of_transit_payment", "=", organization_bank_rule_name],
			],
			fields=[
				"organization_bank_rule",
				"expense_item",
				"group_index",
			],
			distinct=True,
		)
		for group_budget_operation in grouped_budget_operations:
			budget_operations = frappe.get_all(
				"Budget Operations",
				filters=[
					["organization_bank_rule", "=", group_budget_operation.organization_bank_rule],
					["date", "=", target_date],
					["sum", ">", 0],
					["expense_item", "=", group_budget_operation.expense_item],
					["group_index", "=", group_budget_operation.group_index],
					["recipient_of_transit_payment", "=", organization_bank_rule_name],
				],
				fields=[
					"name",
					"date",
					"budget_operation_type",
					"organization_bank_rule",
					"sum",
					"expense_item",
					"recipient_of_transit_payment",
					"group_index",
				],
			)
			allowed_budget_operation_type = (
				"Факт"
				if any(
					[
						budget_operation.budget_operation_type == "Факт"
						for budget_operation in budget_operations
					]
				)
				is True
				else "План"
			)
			for budget_operation in budget_operations:
				if budget_operation.budget_operation_type == allowed_budget_operation_type:
					current_budget_operations_transfers += budget_operation.sum
					used_budget_operations.append(budget_operation)

	return {
		"current_budget_operations_transfers": current_budget_operations_transfers,
		"used_budget_operations": used_budget_operations,
	}


# 4
def calculate_balance_type_movement_of_budget_operations(organization_bank_rule_name, target_date):
	rows = frappe.get_all(
		"Movements of Budget Operations",
		filters=[
			["organization_bank_rule", "=", organization_bank_rule_name],
			["date", "=", target_date],
			["budget_balance_type", "!=", "Balance"],
		],
		fields=["name", "sum", "budget_balance_type"],
	)
	current_budget_operations_remainings = 0
	used_budget_operations = []

	for row in rows:
		used_budget_operations.append(row.name)
		if row.budget_balance_type in ["Transfer", "Remaining", "Movement"]:
			current_budget_operations_remainings += row.sum

	return {
		"current_budget_operations_remainings": current_budget_operations_remainings,
		"used_budget_operations": [],
	}


def save_movement_of_budget_operations(
	target_date, organization_bank_rule, sum, budget_balance_type, budget_operations
):
	"""
	Если для заданной (date, organization_bank_rule, budget_balance_type)
	запись существует — обновляем её, иначе создаём новую.
	"""
	# 1) Подготовим фильтры для поиска
	filters = {
		"date": target_date,
		"organization_bank_rule": organization_bank_rule,
		"budget_balance_type": budget_balance_type,
	}

	# 2) Поищем существующую запись
	existing = frappe.get_all(
		"Movements of Budget Operations", filters=filters, pluck="name", limit_page_length=1
	)

	if existing:
		# 3a) Обновляем существующий документ
		doc = frappe.get_doc("Movements of Budget Operations", existing[0])
	else:
		# 3b) Создаём новую
		doc = frappe.new_doc("Movements of Budget Operations")
		doc.date = target_date
		doc.organization_bank_rule = organization_bank_rule
		doc.budget_balance_type = budget_balance_type

	# 4) В обоих случаях обновляем/устанавливаем поля
	doc.sum = flt(sum or 0)

	# budget_operations — ожидается список имён (["BO-0001", "BO-0002", …])
	doc.set("budget_operations", [])
	for budget_operation in budget_operations:
		doc.append("budget_operations", {"value": budget_operation.name})

	# 5) Сохраняем
	doc.save()


def calculate_movements_of_budget_operations(organization_bank_rule_name, target_date):
	# BUG: Двойной пересчет из-за создания двойных строк с одной датой

	today = datetime.now(pytz.timezone("Europe/Moscow")).date()

	# Если target_date в будущем — используем в качестве точки входа сегодня, иначе — сам target_date
	start_boundary = today if target_date > today else target_date

	# 1) Берём все даты операций начиная от start_boundary
	date_objs = frappe.get_all(
		"Budget Operations",
		filters=[
			["date", ">=", start_boundary],
			["organization_bank_rule", "=", organization_bank_rule_name],
		],
		pluck="date",
		distinct=True,
	)
	# 2) Сортируем (pluck уже отдаёт date-объекты)
	date_objs.sort()

	if not date_objs:
		return

	# 3) Определяем фактический интервал:
	#    сначала — либо самая ранняя дата операций, либо today (если все операции «в будущем»)
	first_date = date_objs[0] if date_objs[0] <= today else today
	last_date = date_objs[-1]

	# 4) Строим полный список подряд идущих дат от first_date до last_date включительно
	full_dates = [first_date + timedelta(days=offset) for offset in range((last_date - first_date).days + 1)]

	# 5) И ещё один день после последнего (ваша старая логика)
	full_dates.append(last_date + timedelta(days=1))

	for selected_date in full_dates:
		# вычислили и сохранили
		calculated_remaining_type = calculate_remaining_type_movement_of_budget_operations(
			organization_bank_rule_name, selected_date
		)
		save_movement_of_budget_operations(
			selected_date,
			organization_bank_rule_name,
			calculated_remaining_type["current_budget_operations_remainings"],
			"Remaining",
			calculated_remaining_type["used_movement_budget_operation"],
		)

		calculated_movement_type = calculate_movement_type_movement_of_budget_operations(
			organization_bank_rule_name, selected_date
		)

		save_movement_of_budget_operations(
			selected_date,
			organization_bank_rule_name,
			calculated_movement_type["current_budget_operations_movements"],
			"Movement",
			calculated_movement_type["used_budget_operations"],
		)

		calculated_transfer_type = calculate_transfer_type_movement_of_budget_operations(
			organization_bank_rule_name, selected_date
		)
		# print(calculated_transfer_type)
		save_movement_of_budget_operations(
			selected_date,
			organization_bank_rule_name,
			calculated_transfer_type["current_budget_operations_transfers"],
			"Transfer",
			calculated_transfer_type["used_budget_operations"],
		)

		calculated_balance_type = calculate_balance_type_movement_of_budget_operations(
			organization_bank_rule_name, selected_date
		)

		save_movement_of_budget_operations(
			selected_date,
			organization_bank_rule_name,
			calculated_balance_type["current_budget_operations_remainings"],
			"Balance",
			"",  # TODO: баланс зависит от всего выше
		)


def publish_budget_change_by_update_budget_operation(doc, method):
	organization_bank_rule_name = doc.get("organization_bank_rule")
	if not organization_bank_rule_name:
		return
	calculate_movements_of_budget_operations(organization_bank_rule_name, doc.date)
	# Вызываем пересчет у того, кому сделали перевод

	if doc.expense_item != "" and frappe.get_doc("Expense Items", doc.expense_item).is_transit:
		calculate_movements_of_budget_operations(doc.recipient_of_transit_payment, doc.date)
		publish_budget_change(doc.recipient_of_transit_payment)
	publish_budget_change(organization_bank_rule_name)


def get_autoname_pattern(doctype):
	"""Вернёт строку из поля Autoname у DocType."""
	return frappe.db.get_value("DocType", doctype, "autoname")


def apply_format(template, context):
	"""
	Подставляет значения из context в шаблон
	вида "format:{organization} / {bank}".
	"""
	# отбросить префикс "format:"
	if template.startswith("format:"):
		template = template[len("format:") :]
	# теперь можно использовать стандартный str.format
	try:
		return template.format(**context)
	except KeyError as e:
		# если в context не нашлось какого-то ключа, можно
		# либо выбросить понятную ошибку, либо подставить пустую строку
		missing = e.args[0]
		raise ValueError(f"В шаблоне не найдено значение для '{missing}'")


def generate_new_name(doctype, doc):
	"""
	Даст новое уникальное имя для документа doc.doctype
	по его текущему правилу автонейма.
	"""
	pattern = get_autoname_pattern(doctype)
	return apply_format(pattern, {"organization": doc.organization, "bank": doc.bank})


def publish_budget_change_by_rename_organization(doc, method, after_rename, before_rename, merge):
	rule_name = frappe.get_all("Organization-Bank Rules", filters={"organization": doc.name}, pluck="name")
	for old_rule_name in rule_name:
		rule = frappe.get_doc("Organization-Bank Rules", old_rule_name)
		new_rule_name = generate_new_name(rule.doctype, rule)
		frappe.rename_doc(rule.doctype, old_rule_name, new_rule_name, merge=False)


def publish_budget_change_by_rename_bank(doc, method, after_rename, before_rename, merge):
	rule_name = frappe.get_all("Organization-Bank Rules", filters={"bank": doc.name}, pluck="name")
	for old_rule_name in rule_name:
		rule = frappe.get_doc("Organization-Bank Rules", old_rule_name)
		new_rule_name = generate_new_name(rule.doctype, rule)
		frappe.rename_doc(rule.doctype, old_rule_name, new_rule_name, merge=False)


def publish_budget_change_by_update_expense_item(doc, method):
	links = frappe.get_all("Organization-Bank Rules", filters={"link_expense_item": doc.name}, pluck="name")
	for rule in links:
		publish_budget_change(rule)


def publish_budget_change_by_update_organization_bank_rule(doc, method):
	publish_budget_change(doc.name)


def publish_budget_change_by_rename_organization_bank_rule(doc, method, after_rename, before_rename, merge):
	publish_budget_page_refresh()


def publish_budget_change_by_trash_organization_bank_rule(doc, method):
	publish_budget_page_refresh()
