frappe.pages["budget-operations-excel-editor"].on_page_load = function (wrapper) {
	if (
		!$("link[href='https://cdn.jsdelivr.net/npm/handsontable/styles/handsontable.min.css']")
			.length
	) {
		$("head").append(
			'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/handsontable/styles/handsontable.min.css" />'
		);
	}
	if (
		!$("link[href='https://cdn.jsdelivr.net/npm/handsontable/styles/ht-theme-main.min.css']")
			.length
	) {
		$("head").append(
			'<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/handsontable/styles/ht-theme-main.min.css" />'
		);
	}

	new PageContent(wrapper);

	frappe.require(["budget_operations_excel_editor.bundle.js"]).then(() => {});
};

const PageContent = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Budget planning (Excel)"),
			single_column: true,
		});

		this.make();
	},

	make: function () {
		frappe.db
			.get_list("organization-bank rules", {
				fields: [],
				filters: {
					is_active: true,
				},
				order_by: "creation asc",
			})
			.then((records) => {
				let organization_bank_rules_select = [];
				for (let record of records) {
					organization_bank_rules_select.push(record.name);
				}

				// Выбираем первый элемент в массиве как значение по умолчанию
				let default_value = organization_bank_rules_select[0];

				this.page.add_field({
					label: "Organization Bank Rules",
					fieldtype: "Select",
					fieldname: "organization_bank_rules_select",
					options: organization_bank_rules_select.join("\n"),
					default: default_value, // значение по умолчанию
					change() {
						window.setup_excel_editor_table(this.get_value());
					},
				});
				window.setup_excel_editor_table(default_value);
			});

		$(frappe.render_template("budget_operations_excel_editor", this)).appendTo(this.page.main);
	},
});
