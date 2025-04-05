import frappe


@frappe.whitelist()
def get_budget_plannig_data_for_handsontable(organization_bank_rule_name):
	from datetime import date, timedelta

	# Функция для создания пустой строки с заданной датой и типом
	def create_empty_row(date_str, type_str):
		row = list("" for _ in colHeaders)
		row[0] = date_str
		row[1] = type_str
		return row

	data = []
	colHeaders = []
	columns = []

	org_bank_rules = frappe.get_list(
		"Organization-Bank Rules", filters={"is_active": True}, order_by="creation asc"
	)
	org_bank_rules_names = [item.name for item in org_bank_rules]

	# Получаем документ с настройками и список Expense Items
	org_bank_rule_doc = frappe.get_doc("Organization-Bank Rules", organization_bank_rule_name)
	organization_bank_rules = org_bank_rule_doc.available_expense_items
	expense_items = []
	for item in organization_bank_rules:
		expense_items.append(item.get("link_expense_item"))

	# Первые колонки: Дата и Тип
	colHeaders.extend(["Дата", "Тип"])
	columns.extend(
		[
			{
				"field": "date",
				"label": "Дата",
				"type": "date",
				"dateFormat": "YYYY-MM-DD",
				"correctFormat": True,
				"allowInvalid": False,
			},
			{
				"field": "type",
				"label": "Тип",
				"type": "select",
				"selectOptions": ["План", "Факт"],
			},
		]
	)

	# Для каждого expense item добавляем 3 колонки: значение, описание и комментарий
	for item_name in expense_items:
		colHeaders.append(item_name)

		columns.append(
			{
				"field": f"{item_name}",
				"label": f"{item_name}",
				"type": "numeric",
				"allowInvalid": False,
			}
		)

		if frappe.get_doc("Expense item", item_name).is_transit:
			colHeaders.append(f"{item_name} Транзит")
			columns.append(
				{
					"field": f"{item_name}_transit",
					"label": f"{item_name} transit",
					"type": "dropdown",
					"source": org_bank_rules_names,
				}
			)

		colHeaders.append(f"{item_name} Описание")
		colHeaders.append(f"{item_name} Комментарий")

		columns.append(
			{
				"field": f"{item_name}_description",
				"label": f"{item_name} Description",
				"type": "text",
			}
		)
		columns.append(
			{
				"field": f"{item_name}_comment",
				"label": f"{item_name} Comment",
				"type": "text",
			}
		)

	# Определяем диапазон дат: от 15 дней до текущей даты до 15 дней после
	current_date = date.today()
	start_date = current_date - timedelta(days=15)
	end_date = current_date + timedelta(days=15)

	# Список дат в формате YYYY-MM-DD
	date_range = []
	d = start_date
	while d <= end_date:
		date_range.append(d.strftime("%Y-%m-%d"))
		d += timedelta(days=1)

	# Получаем операции по бюджету в заданном диапазоне и сортируем по дате
	budget_operations = frappe.db.get_list(
		"Budget operation",
		filters=[
			["date", ">=", start_date.strftime("%Y-%m-%d")],
			["date", "<=", end_date.strftime("%Y-%m-%d")],
		],
		order_by="date asc",
		fields=[
			"date",
			"type",
			"organization_bank_rule",
			"sum",
			"expense_item",
			"recipient_of_transit_payment",
			"description",
			"comment",
		],
	)

	# format data
	for budget_operation in budget_operations:
		budget_operation["date"] = budget_operation["date"].strftime("%Y-%m-%d")
		budget_operation["expense_item"] = (
			budget_operation["expense_item"] if budget_operation["expense_item"] else ""
		)
		budget_operation["description"] = (
			budget_operation["description"] if budget_operation["description"] else ""
		)
		budget_operation["comment"] = budget_operation["comment"] if budget_operation["comment"] else ""
		budget_operation["recipient_of_transit_payment"] = (
			budget_operation["recipient_of_transit_payment"]
			if budget_operation["recipient_of_transit_payment"]
			else ""
		)

	# Теперь нужно преобразовать данные согласно колонкам
	for idx, value in enumerate(budget_operations):
		budget_operations[idx] = create_empty_row(value["date"], value["type"])
		if value["expense_item"] in colHeaders:
			budget_operations[idx][colHeaders.index(value["expense_item"])] = value["sum"]
			if f"{value['expense_item']} Транзит" in colHeaders:
				budget_operations[idx][colHeaders.index(f"{value['expense_item']} Транзит")] = value[
					"recipient_of_transit_payment"
				]

	# Группируем операции по дате
	operations_by_date = {}
	for op in budget_operations:
		op_date = op[0]
		# print(op_date, operations_by_date)
		if op_date not in operations_by_date:
			operations_by_date[op_date] = []
		operations_by_date[op_date].append(op)

	# Формируем итоговую матрицу данных
	for d in date_range:
		ops = operations_by_date.get(d, [])
		# Разбиваем найденные операции по типу
		plan_ops = [op for op in ops if op[1] == "План"]
		fact_ops = [op for op in ops if op[1] == "Факт"]

		# Если для даты отсутствует операция типа "План", добавляем пустую строку
		if not plan_ops:
			plan_ops = [create_empty_row(d, "План")]

		# Если для даты отсутствует операция типа "Факт", добавляем пустую строку
		if not fact_ops:
			fact_ops = [create_empty_row(d, "Факт")]

		# В результирующем наборе сначала идут все операции типа "План", затем "Факт"
		for op in plan_ops + fact_ops:
			data.append(op)

	# print(data)

	return {"colHeaders": colHeaders, "columns": columns, "data": data}
