# Copyright (c) 2025, GeorgyTaskabulov and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class ExpenseItems(Document):
	def on_trash(self):
		# Если установлен флаг is_mandatory, запретить удаление
		if self.get("is_mandatory"):
			frappe.throw(
				_("Cannot delete mandatory Expense Item: {0}").format(self.name),
				title=_("Deletion Not Allowed"),
			)
