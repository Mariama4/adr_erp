// Инициализация страницы "budget-operations-excel-editor"
frappe.pages["budget-operations-excel-editor"].on_page_load = function (wrapper) {
	// 1) Запоминаем, было ли уже full-width
	const initialFull = JSON.parse(localStorage.container_fullwidth || "false");
	wrapper._initialFullwidth = initialFull;

	// 2) Если изначально не было — включаем
	if (!initialFull) {
		frappe.ui.toolbar.toggle_full_width();
		wrapper._toggledFullwidth = true;
	}

	loadHandsontableStyles();
	new PageContent(wrapper);
};

// Когда пользователь уходит с этой страницы — возвращаем предыдущий режим
frappe.pages["budget-operations-excel-editor"].on_page_hide = function (wrapper) {
	// Если мы включали full-width сами — выключаем
	if (wrapper._toggledFullwidth) {
		frappe.ui.toolbar.toggle_full_width();
	}
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
			.get_list("Organization-Bank Rules", {
				fields: [],
				order_by: "creation asc",
				limit_page_length: null,
			})
			.then((records) => {
				const organization_bank_rules_select = records.map((r) => r.name);
				if (!organization_bank_rules_select.length) {
					frappe.msgprint({
						title: __("Warning"),
						message: __("No 'Organization-Bank Rules' available"),
						indicator: "yellow",
					});
					return;
				}

				// Читаем прошлый выбор (если есть)
				const savedOrg = localStorage.getItem("budget_ops_org");
				const savedDays = localStorage.getItem("budget_ops_days");

				// Подставляем либо сохранённое, либо первый/7
				window.current_organization_bank_rules_select =
					savedOrg && organization_bank_rules_select.includes(savedOrg)
						? savedOrg
						: organization_bank_rules_select[0];

				window.current_number_of_days_select =
					savedDays && +savedDays >= 1 && +savedDays <= 99 ? savedDays : "7";

				this.page.set_indicator(__("Online"), "green");
				this.page.add_field({
					label: __("Organization Bank Rules"),
					fieldtype: "Link",
					fieldname: "organization_bank_rules_select",
					options: "Organization-Bank Rules", // DocType, из которого берём значения
					default: window.current_organization_bank_rules_select,
					change() {
						if (this.get_value() == "") {
							return;
						}
						localStorage.setItem("budget_ops_org", this.get_value());
						window.current_organization_bank_rules_select = this.get_value();
						window.setup_excel_editor_table(
							window.current_organization_bank_rules_select,
							window.current_number_of_days_select,
							true
						);
						loadComment();
						frappe.show_alert({
							message: __("Data updated"),
							indicator: "blue",
						});
					},
				});

				const nums = Array.from({ length: 99 }, (_, i) => i + 1).join("\n");
				this.page.add_field({
					label: __("Select number of days"),
					fieldtype: "Select",
					fieldname: "number_of_days_select",
					options: nums,
					default: window.current_number_of_days_select,
					change() {
						localStorage.setItem("budget_ops_days", this.get_value());
						window.current_number_of_days_select = this.get_value();
						window.setup_excel_editor_table(
							window.current_organization_bank_rules_select,
							window.current_number_of_days_select,
							true
						);
						frappe.show_alert({
							message: __("Data updated"),
							indicator: "blue",
						});
					},
				});

				// Функция загрузки комментария из БД
				const loadComment = () => {
					frappe.db
						.get_value(
							"Organization-Bank Rules",
							window.current_organization_bank_rules_select,
							[
								"comment_fl_sum",
								"comment_fl_percent",
								"comment_nr_sum",
								"comment_nr_percent",
								"comment_ul_sum",
								"comment_ul_percent",
								"comment_ip_sum",
								"comment_ip_percent",
								"comment_is_sp_connected",
								"comment_services",
							]
						)
						.then(({ message }) => {
							$(document).find(".page-form .page-only-label")?.remove();
							let comment = `ЗП ${
								message.comment_is_sp_connected ? "✅" : "❌"
							}| мин. ФЛ ${message.comment_fl_sum || 0} / ${
								message.comment_fl_percent || 0
							} %| ИП ${message.comment_ip_sum || 0} / ${
								message.comment_ip_percent || 0
							} %| ЮЛ ${message.comment_ul_sum || 0} / ${
								message.comment_ul_percent || 0
							} %| НР ${message.comment_nr_sum || 0} / ${
								message.comment_nr_percent || 0
							} %| Сервисы: ${message.comment_services || ""}`;
							this.page.add_label(message ? comment : __("No comment"));
							$(document)
								.find(".page-form .page-only-label")
								?.removeClass("col-md-1");
						});
				};

				loadComment();
			});

		// Рендерим шаблон страницы (если есть необходимость оформления через шаблон)
		$(frappe.render_template("budget_operations_excel_editor", this)).appendTo(this.page.main);
	},
});
