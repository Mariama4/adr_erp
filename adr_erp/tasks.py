from datetime import datetime, timedelta

import frappe
import pytz

from .budget.budget_api import calculate_movements_of_budget_operations, publish_budget_change


def prepare_budget_movement_data(rule=None, target_date=None):
	today = datetime.now(pytz.timezone("Europe/Moscow")).date()
	next_month_date = today + timedelta(days=30)
	if rule is None:
		all_ob_rules = frappe.get_all("Organization-Bank Rules", pluck="name")

		for rule in all_ob_rules:
			calculate_movements_of_budget_operations(rule, next_month_date, True)
			publish_budget_change(rule)
	else:
		calculate_movements_of_budget_operations(rule, next_month_date, True, target_date)
	publish_budget_change(rule)
