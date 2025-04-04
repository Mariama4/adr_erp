// Copyright (c) 2025, GeorgyTaskabulov and contributors
// For license information, please see license.txt

frappe.ui.form.on("Budget operation", {
    // При изменении поля expense_item
    expense_item: function(frm) {
      if (frm.doc.expense_item) {
        // Получаем документ Expense item по значению поля expense_item
        frappe.db.get_doc('Expense item', frm.doc.expense_item).then(doc => {
          // Если у полученного документа стоит галочка is_transit, показываем поле, иначе скрываем
          frm.toggle_display('recipient_of_transit_payment', !!doc.is_transit);
        });
      } else {
        // Если поле expense_item не заполнено, скрываем поле recipient_of_transit_payment
        frm.toggle_display('recipient_of_transit_payment', false);
      }
    },
    // При загрузке/обновлении формы
    refresh: function(frm) {
      if (frm.doc.expense_item) {
        frappe.db.get_doc('Expense item', frm.doc.expense_item).then(doc => {
          frm.toggle_display('recipient_of_transit_payment', !!doc.is_transit);
        });
      } else {
        frm.toggle_display('recipient_of_transit_payment', false);
      }
    }
});
  
