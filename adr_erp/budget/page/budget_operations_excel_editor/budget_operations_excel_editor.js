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
					options: "Organization-Bank Rules",
					default: window.current_organization_bank_rules_select,
					only_select: true,
					get_query: function () {
						return {
							page_length: 100,
						};
					},
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

				// Добавляем кнопку для открытия формы Organization bank rule в popup
				this.page.add_button(__("Edit Rule Comments"), () => {
					if (!window.current_organization_bank_rules_select) {
						frappe.msgprint(__("No Organization Bank Rule selected."));
						return;
					}

					// Загружаем только нужные поля
					frappe.call({
						method: "frappe.client.get",
						args: {
							doctype: "Organization-Bank Rules",
							name: window.current_organization_bank_rules_select,
							fields: [
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
							],
						},
						callback: (r) => {
							if (r.message) {
								const doc = r.message; // Текущие значения документа
								const dialog = new frappe.ui.Dialog({
									title: __("Edit Comments for: {0}", [doc.name]),
									fields: [
										{
											label: __("Comment FL Sum"),
											fieldname: "comment_fl_sum",
											fieldtype: "Float",
											default: doc.comment_fl_sum || 0,
										},
										{
											label: __("Comment FL Percent"),
											fieldname: "comment_fl_percent",
											fieldtype: "Percent",
											default: doc.comment_fl_percent || 0,
										},
										{
											label: __("Comment NR Sum"),
											fieldname: "comment_nr_sum",
											fieldtype: "Float",
											default: doc.comment_nr_sum || 0,
										},
										{
											label: __("Comment NR Percent"),
											fieldname: "comment_nr_percent",
											fieldtype: "Percent",
											default: doc.comment_nr_percent || 0,
										},
										{
											label: __("Comment UL Sum"),
											fieldname: "comment_ul_sum",
											fieldtype: "Float",
											default: doc.comment_ul_sum || 0,
										},
										{
											label: __("Comment UL Percent"),
											fieldname: "comment_ul_percent",
											fieldtype: "Percent",
											default: doc.comment_ul_percent || 0,
										},
										{
											label: __("Comment IP Sum"),
											fieldname: "comment_ip_sum",
											fieldtype: "Float",
											default: doc.comment_ip_sum || 0,
										},
										{
											label: __("Comment IP Percent"),
											fieldname: "comment_ip_percent",
											fieldtype: "Percent",
											default: doc.comment_ip_percent || 0,
										},
										{
											label: __("Is SP Connected"),
											fieldname: "comment_is_sp_connected",
											fieldtype: "Check",
											default: doc.comment_is_sp_connected || 0,
										},
										{
											label: __("Services"),
											fieldname: "comment_services",
											fieldtype: "Data",
											default: doc.comment_services || "",
										},
									],
									primary_action_label: __("Save"),
									primary_action: (values) => {
										// `values` содержит данные из полей диалога
										frappe.call({
											method: "frappe.client.set_value",
											args: {
												doctype: "Organization-Bank Rules",
												name: doc.name, // Имя текущего документа
												fieldname: values, // Объект с обновленными полями
											},
											callback: (response) => {
												if (response.message) {
													frappe.show_alert({
														message: __(
															"Comments updated successfully."
														),
														indicator: "green",
													});
													dialog.hide();
													loadComment(); // Перезагрузить комментарий на основной странице
												} else {
													frappe.msgprint(
														__("Error updating comments.")
													);
												}
											},
										});
									},
								});
								dialog.show();
							} else {
								frappe.msgprint(__("Could not load Organization Bank Rule."));
							}
						},
					});
				});

				loadComment();
			});

		// Рендерим шаблон страницы (если есть необходимость оформления через шаблон)
		$(frappe.render_template("budget_operations_excel_editor", this)).appendTo(this.page.main);
	},
});
