import frappe


@frappe.whitelist()
def get_budget_plannig_data_for_handsontable(organization_bank_rule_name):
	from datetime import date, timedelta

	data = []
	colHeaders = []
	columns = []

	# Получаем документ с настройками и список Expense Items
	org_bank_rule_doc = frappe.get_doc("Organization-Bank Rules", organization_bank_rule_name)
	organization_bank_rules = org_bank_rule_doc.available_expense_items
	expense_items = []
	for item in organization_bank_rules:
		# Здесь замените "link_expense_item" на нужное вам имя поля, если требуется
		expense_items.append(item.get("link_expense_item"))

	# Первые колонки: Дата и Тип
	colHeaders.extend(["Дата", "Тип"])
	columns.extend([
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
	])

	# Для каждого expense item добавляем 3 колонки: значение, описание и комментарий
	for item_name in expense_items:
		colHeaders.append(item_name)
		colHeaders.append(f"{item_name} Описание")
		colHeaders.append(f"{item_name} Комментарий")

		columns.append({
			"field": f"{item_name}",
			"label": f"{item_name}",
			"type": "numeric",
			"allowInvalid": False,
		})
		columns.append({
			"field": f"{item_name}_description",
			"label": f"{item_name} Description",
			"type": "text",
		})
		columns.append({
			"field": f"{item_name}_comment",
			"label": f"{item_name} Comment",
			"type": "text",
		})

	# Определяем диапазон дат: от 15 дней до текущей даты до 15 дней после
	current_date = date.today()
	start_date = current_date - timedelta(days=7)
	end_date = current_date + timedelta(days=7)

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
			["date", "<=", end_date.strftime("%Y-%m-%d")]
		],
		order_by="date asc",
		fields=[
			'date', 'type',
			'organization_bank_rule', 'sum',
			'expense_item', 'recipient_of_transit_payment',
			'description', 'comment'
		]
	)

	# Группируем операции по дате
	operations_by_date = {}
	for op in budget_operations:
		op_date = op.get("date")
		if op_date not in operations_by_date:
			operations_by_date[op_date] = []
		operations_by_date[op_date].append(op)

	# Функция для создания пустой строки с заданной датой и типом
	def create_empty_row(date_str, type_str):
		row = list('' for _ in colHeaders)
		row[0] = date_str
		row[1] = type_str
		return row

	# Формируем итоговую матрицу данных
	for d in date_range:
		ops = operations_by_date.get(d, [])
		# Разбиваем найденные операции по типу
		plan_ops = [op for op in ops if op.get("type") == "План"]
		fact_ops = [op for op in ops if op.get("type") == "Факт"]

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
