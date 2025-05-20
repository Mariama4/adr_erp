import functools
import time

import frappe


def timed(fn):
	@functools.wraps(fn)
	def wrapper(*args, **kwargs):
		start = time.time()
		result = fn(*args, **kwargs)
		elapsed = time.time() - start
		print(f"[Perf] {fn.__name__} took {elapsed:.3f}s")
		return result

	return wrapper
