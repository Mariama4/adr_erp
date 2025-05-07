// Инициализация страницы "budget-operations-excel-editor"
frappe.pages["budget-operations-excel-editor"].on_page_load = function (wrapper) {
	loadHandsontableStyles();
	new PageContent(wrapper);
};

/**
 * Загружает CSS-стили Handsontable, если они ещё не подключены.
 */
function loadHandsontableStyles() {
	const styles = [
		"https://cdn.jsdelivr.net/npm/handsontable/styles/handsontable.min.css",
		"https://cdn.jsdelivr.net/npm/handsontable/styles/ht-theme-main.min.css",
	];
	styles.forEach((url) => {
		if (!$(`link[href="${url}"]`).length) {
			$("head").append(`<link rel="stylesheet" href="${url}" />`);
		}
	});
}

/**
 * Класс страницы, создающий интерфейс Excel-редактора.
 */
const PageContent = Class.extend({
	init: function (wrapper) {
		this.page = frappe.ui.make_app_page({
			parent: wrapper,
			title: __("Budget planning (Excel)"),
			single_column: true,
		});
		// Подключаем бандл скриптов Excel-редактора, если нужны дополнительные зависимости
		frappe.require(["budget_operations_excel_editor.bundle.js"]).then(() => {});
		this.make();
	},

	make: function () {
		// Получаем список правил для банка и заполняем select-поле
		frappe.db
			.get_list("organization-bank rules", {
				fields: [],
				order_by: "creation asc",
			})
			.then((records) => {
				const organization_bank_rules_select = records.map((record) => record.name);
				const default_value = organization_bank_rules_select[0];

				this.page.add_field({
					label: __("Organization Bank Rules"),
					fieldtype: "Select",
					fieldname: "organization_bank_rules_select",
					options: organization_bank_rules_select.join("\n"),
					default: default_value,
					change() {
						// При изменении значения поля обновляем таблицу
						window.setup_excel_editor_table(this.get_value());
					},
				});
				try {
					window.setup_excel_editor_table(default_value);
				} catch {
					window.location.reload();
				}
				// Инициализируем редактор с выбранным значением по умолчанию
			});

		// Рендерим шаблон страницы (если есть необходимость оформления через шаблон)
		$(frappe.render_template("budget_operations_excel_editor", this)).appendTo(this.page.main);
	},
});
