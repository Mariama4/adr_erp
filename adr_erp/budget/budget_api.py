import frappe

@frappe.whitelist()
def get_budget_plannig_data_for_handsontable():
    # Получаем список всех Expense item (можно добавить фильтры, если нужно)
    expense_items = frappe.db.get_list('Expense item', fields=["name"])
    
    # Если по какой-либо причине список пуст, создадим фейковые Expense item
    if not expense_items:
        expense_items = [{"name": "Item1"}, {"name": "Item2"}]

    # Формируем заголовки колонок (для Handsontable они будут использоваться как colHeaders)
    colHeaders = ["Дата", "Тип"]

    # Инициализируем базовые колонки
    columns = [
        {"field": "date", "label": "Дата"},
        {"field": "type", "label": "Тип"}
    ]

    # Для каждого Expense item добавляем три колонки:
    # 1. Значение expense item (название колонки совпадает с именем Expense item)
    # 2. Описание (Description)
    # 3. Комментарий (Comment)
    for item in expense_items:
        item_name = item.get("name")
        colHeaders.append(item_name)
        colHeaders.append(f'{item_name} Описание')
        colHeaders.append(f'{item_name} Комментарий')
        
        columns.append({
            "field": f"{item_name}",
            "label": f"{item_name}"
        })
        columns.append({
            "field": f"{item_name}_description",
            "label": f"{item_name} Description"
        })
        columns.append({
            "field": f"{item_name}_comment",
            "label": f"{item_name} Comment"
        })

    # Формирование фейковых данных (например, 5 строк)
    import random
    from datetime import datetime, timedelta

    data = []
    base_date = datetime.now()
    types = ["Expense", "Income"]

    for i in range(5):
        row = {}
        # Заполняем колонку "Дата" – берем базовую дату с небольшим сдвигом
        date_value = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        row["date"] = date_value
        # Заполняем колонку "Тип" – случайно выбираем тип
        row["type"] = random.choice(types)
        # Для каждого Expense item добавляем фейковые данные
        for item in expense_items:
            item_name = item.get("name")
            # Значение Expense item – случайное число
            row[item_name] = round(random.uniform(10, 100), 2)
            # Фейковое описание
            row[f"{item_name}_description"] = f"Description for {item_name} row {i+1}"
            # Фейковый комментарий
            row[f"{item_name}_comment"] = f"Comment for {item_name} row {i+1}"
        data.append(row)

    return {
        "colHeaders": colHeaders,
        "columns": columns,
        "data": data
    }

