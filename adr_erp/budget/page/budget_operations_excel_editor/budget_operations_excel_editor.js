frappe.pages['budget-operations-excel-editor'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Budget planning (Excel)',
		single_column: true
	});
}