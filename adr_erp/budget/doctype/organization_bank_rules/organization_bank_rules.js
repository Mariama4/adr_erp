// Copyright (c) 2025, GeorgyTaskabulov and contributors
// For license information, please see license.txt

frappe.ui.form.on("Organization-Bank Rules", {
	refresh(frm) {
		// только для новой формы
		if (!frm.is_new()) return;

		// получаем все Expense Item
		frappe
			.call({
				method: "frappe.client.get_list",
				args: {
					doctype: "Expense Item",
					fields: ["name"], // здесь важно: берем поле name
					limit_page_length: 0,
				},
			})
			.then((r) => {
				const items = r.message || [];

				// очищаем таблицу
				frm.clear_table("available_expense_items");

				// создаём новую строку для каждого элемента
				items.forEach((item) => {
					const row = frm.add_child("available_expense_items");
					row.link_expense_item = item.name;
					row.is_transit = 0; // по умолчанию
				});

				// перерисовываем сетку
				frm.refresh_field("available_expense_items");
			});
	},
});
