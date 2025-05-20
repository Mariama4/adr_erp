// Copyright (c) 2025, GeorgyTaskabulov and contributors
// For license information, please see license.txt

frappe.ui.form.on('Expense Items', {
	onload: function (frm) {
		// Только для новых документов и только если ещё не установлено
		if (frm.is_new() && !frm.doc.entry_type) {
			frm.set_value('entry_type', 'Credit');
		}
	},
});
