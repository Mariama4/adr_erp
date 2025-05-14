import Handsontable from "handsontable";

const container = document.querySelector(".budget_operations_excel_editor_table");
const mainSection = document.querySelector("body > div.main-section");
const bodySidebar = document.querySelector("body > div.body-sidebar-container");
const stickyTop = document.querySelector("body > div.main-section > div.sticky-top");
const bodyEl = document.querySelector("#body");

window.hotInstance = null;

/**
 * Восстанавливает даты в данных. Если дата отсутствует в ячейке (первой колонке),
 * устанавливает её равной ближайшей непустой дате из предыдущих строк.
 * @param {Array} data - Массив данных таблицы.
 * @returns {Array} data - Массив данных с восстановленными датами.
 */
function restoreDatesInData(data) {
	if (!Array.isArray(data)) return data;
	let lastDate = null;
	data.forEach((row) => {
		if (row[0]) {
			lastDate = row[0];
		} else {
			row[0] = lastDate;
		}
	});
	return data;
}

/**
 * Вычисляет конфигурацию объединения ячеек для столбца "Дата"
 * @param {Array} data - Массив данных таблицы.
 * @returns {Array} mergeCells - Конфигурация объединения ячеек.
 */
function getMergeCellsConfig(data, dateColIndex = 0) {
	if (!Array.isArray(data) || data.length === 0) return [];
	const merge = [];
	let start = 0;
	for (let i = 1; i <= data.length; i++) {
		const current = i < data.length ? data[i][dateColIndex] : null;
		if (i === data.length || current !== data[start][dateColIndex]) {
			const span = i - start;
			if (span > 1) {
				merge.push({ row: start, col: dateColIndex, rowspan: span, colspan: 1 });
			}
			start = i;
		}
	}
	return merge;
}

/**
 * Определяет индексы столбцов, которые нужно скрыть.
 * @param {} message - .
 * @returns {Array} hiddenIndices - Массив индексов скрытых столбцов.
 */
function getHiddenColumnsIndices(colHeaders, data) {
	return colHeaders.reduce((acc, header, index) => {
		if (
			header.includes(__("Comment")) &&
			!data.some((row) => row[index] != null && row[index] !== "")
		) {
			acc.push(index);
		}
		if (header.includes("Name") && header.endsWith("Name")) {
			acc.push(index);
		}
		if (header == __("Group Index")) {
			acc.push(index);
		}
		return acc;
	}, []);
}

/**
 * Рассчитывает размеры таблицы с учётом остальных элементов страницы.
 * @returns {Object} - Объект с ключами width и height.
 */
function calculateDimensions() {
	const width = window.innerWidth - bodySidebar.clientWidth;
	const height = mainSection.clientHeight - stickyTop.clientHeight - bodyEl.clientHeight;
	return { width, height };
}

/**
 * Возвращает настройки контекстного меню для Handsontable.
 * Параметр operationTypeNames — массив типов операций, пришедший с сервера.
 *
 * Формируется пункт "Add new row" с подменю: для каждого типа операции создаётся подпункт,
 * при выборе которого вставляется в конец таблицы новая строка с текущей датой (в колонке 0)
 * и соответствующим типом операции (в колонке 1). После вставки обновляется объединение строк.
 *
 * @param {Array} operationTypeNames - Массив строк с типами операций.
 * @returns {Object} contextMenuSettings
 */
function getContextMenuSettings(operationTypeNames = [], organization_bank_rule_name = null) {
	const newRowSubmenu = {};
	operationTypeNames.forEach((opType) => {
		newRowSubmenu[`add_new_row_${opType}`] = {
			name: __("Add row with type '{0}'", [opType]),
			callback: function (key, selection, clickEvent) {
				const hot = window.hotInstance;
				let tableData = restoreDatesInData(hot.getSourceData());
				// Используем индекс последней строки выделенного диапазона
				let selectedIndexRow = selection[selection.length - 1].end.row;
				let selectedRow = tableData[selectedIndexRow];
				// Формируем payload для каждой группы
				const payload = [
					{
						name: null,
						date: selectedRow[0],
						budget_type: opType,
						group_index: null,
						expense_item: null,
						sum: null,
						recipient_of_transit_payment: null,
						description: null,
						comment: null,
					},
				];

				frappe.call({
					method: "adr_erp.budget.budget_api.save_budget_changes",
					args: { organization_bank_rule_name, changes: payload },
				});
			},
		};
	});

	return {
		items: {
			add_col_comment: {
				name: __("Add comment"),
				callback: function (key, selection) {
					let hiddenCols = this.getSettings().hiddenColumns.columns || [];
					let newHiddenCols = Array.isArray(hiddenCols) ? [...hiddenCols] : [];
					selection.forEach((sel) => {
						let targetCol = sel.end.col;
						let checkRange = 3;
						const nextColHeader = this.getColHeader(targetCol + 1);
						if (nextColHeader && nextColHeader.includes(__("Transit"))) {
							checkRange = 4;
						}
						while (
							targetCol < this.countCols() &&
							targetCol < sel.end.col + checkRange
						) {
							if (newHiddenCols.includes(targetCol)) {
								newHiddenCols = newHiddenCols.filter(
									(colIndex) => colIndex !== targetCol
								);
								break;
							}
							targetCol++;
						}
					});
					this.updateSettings({
						hiddenColumns: {
							columns: newHiddenCols,
							indicators: true,
						},
					});
				},
			},
			...newRowSubmenu,
		},
	};
}

/**
 * Дебаунс-функция для уменьшения частоты вызовов.
 * @param {Function} func - Функция, которую нужно вызывать.
 * @param {number} delay - Задержка в миллисекундах.
 * @returns {Function} Обёрнутую функцию.
 */
function debounce(func, delay) {
	let timeout;
	return function (...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), delay);
	};
}

/**
 * Инициализирует или обновляет Handsontable с полученными данными и настройками.
 * Ожидается, что message имеет ключи: data, columns, colHeaders, operationTypeNames.
 */
function initHandsontableInstance(message, organization_bank_rule_name) {
	const raw = (message.data || []).map((r) => [...r]);
	const data = restoreDatesInData(raw);
	const colHeaders = message.colHeaders || [];
	const cols = message.columns || [];
	const opTypes = Array.isArray(message.operationTypeNames) ? message.operationTypeNames : [];

	const colsMetaSettings = cols;
	const dateColIndex = cols.findIndex((c) => c.field === "date");

	const mergeCells = getMergeCellsConfig(data, dateColIndex);
	const hiddenCols = getHiddenColumnsIndices(colHeaders, data);
	const { width, height } = calculateDimensions();
	const contextMenuSettings = getContextMenuSettings(opTypes, organization_bank_rule_name);

	const hotSettings = {
		data: message.data,
		columns: message.columns,
		fixedColumnsStart: 2,
		rowHeaders: true,
		autoWrapRow: true,
		autoWrapCol: true,
		manualColumnResize: true,
		colWidths: [105, 60, 60, 105, 105, 105].concat(
			Array.from({ length: message.columns.length - 2 }, (_, i) => [100, 150, 150][i % 3])
		),
		colHeaders: message.colHeaders,
		mergeCells: mergeCells,
		width: width,
		height: height,
		contextMenu: contextMenuSettings,
		hiddenColumns: {
			columns: hiddenCols,
			indicators: false,
			copyPasteEnabled: false,
		},
		viewportRowRenderingOffset: 0,
		maxRows: message.data.length,
		allowInvalid: false,
		afterGetColHeader: function (col, TH) {
			if (col >= 0) {
				TH.style.fontWeight = "bold";
				TH.style.textAlign = "center";
				const headerText = TH.innerText || "";
				if (headerText.includes(__("Comment")) || headerText.includes(__("Description"))) {
					TH.style.backgroundColor = "#FFCCCC";
				} else {
					TH.style.backgroundColor = "#d3d3d3";
				}
			}
		},

		// Обработчик изменений в таблице. Если изменения были внесены пользователем,
		// собираем payload и отправляем на сервер.
		afterChange: (changes, source) => {
			if (!changes || !["edit", "CopyPaste.paste"].includes(source)) return;

			// Получаем свежие данные с учётом восстановления дат
			const freshRaw = window.hotInstance.getSourceData().map((r) => [...r]);
			const freshData = restoreDatesInData(freshRaw);

			// Индекс даты
			const dateIdx = colsMetaSettings.findIndex((c) => c.field === "date");
			const rowCount = freshData.length;
			const colCount = colsMetaSettings.length;

			// Сначала строим маппинг rowIndex -> порядковый номер в группе (date|type)
			const rowOrdinalMap = {};
			const groupCounters = {}; // key -> next ordinal
			freshData.forEach((row, idx) => {
				const key = `${row[dateIdx]}|${row[1]}`; // date|budget_type
				if (!(key in groupCounters)) {
					groupCounters[key] = 0;
				}
				rowOrdinalMap[idx] = groupCounters[key]++;
			});

			// Группируем изменения по строке и expense_item
			const groups = {};
			changes.forEach(([row, col]) => {
				if (row < 0 || row >= rowCount || col < 0 || col >= colCount) {
					// пропускаем некорректные координаты
					return;
				}
				const field = colsMetaSettings[col].field;
				const base = field.split("_")[0];
				const key = `${row}|${base}`;
				groups[key] = row;
			});

			// Формируем payload для каждой группы
			const payload = Object.keys(groups).map((key) => {
				const rowIndex = groups[key];
				const rowArr = freshData[rowIndex];
				const date = rowArr[dateIdx];
				const budget_type = rowArr[1];
				const base = key.split("|")[1];

				const findField = (name) => colsMetaSettings.findIndex((c) => c.field === name);
				const idIdx = findField(`${base}_name`);
				const sumIdx = findField(base);
				const transitIdx = findField(`${base}_transit`);
				const descIdx = findField(`${base}_description`);
				const commIdx = findField(`${base}_comment`);

				return {
					name: idIdx >= 0 ? rowArr[idIdx] : null,
					date,
					budget_type,
					expense_item: base,
					sum: rowArr[sumIdx],
					recipient_of_transit_payment: rowArr[transitIdx],
					description: rowArr[descIdx],
					comment: rowArr[commIdx],
					group_index: rowOrdinalMap[rowIndex], // добавили порядковый номер
				};
			});

			if (!payload.length) return;

			frappe.call({
				method: "adr_erp.budget.budget_api.save_budget_changes",
				args: { organization_bank_rule_name, changes: payload },
			});
		},

		licenseKey: "non-commercial-and-evaluation",
	};

	if (window.hotInstance) {
		window.hotInstance.updateSettings(hotSettings);
		window.hotInstance.loadData(message.data);
	} else {
		window.hotInstance = new Handsontable(container, hotSettings);
		scrollToCurrentDate();
	}
}

/**
 * Прокручивает таблицу к текущей дате.
 */
function scrollToCurrentDate() {
	const now = new Date();
	const year = now.getFullYear();
	const month = (now.getMonth() + 1).toString().padStart(2, "0");
	const day = now.getDate().toString().padStart(2, "0");
	const currentDate = `${year}-${month}-${day}`;
	const rowIndex = window.hotInstance.getSourceData().findIndex((row) => row[0] === currentDate);
	if (rowIndex >= 0) {
		window.hotInstance.scrollViewportTo(rowIndex);
	}
}

/**
 * Привязывает обработчик изменения размеров окна для обновления настроек Handsontable.
 */
function attachResizeListener() {
	window.addEventListener("resize", () => {
		if (window.hotInstance) {
			const { width, height } = calculateDimensions();
			window.hotInstance.updateSettings({
				width: width,
				height: height,
			});
		}
	});
}

/**
 * Основная функция для обновления Excel-редактора.
 * Запрашивает данные с сервера и обновляет экземпляр Handsontable.
 *
 * @param {String} organization_bank_rule_name - Имя документа правил организации.
 */
function setup_excel_editor_table(organization_bank_rule_name, number_of_days) {
	frappe
		.call("adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable", {
			organization_bank_rule_name: organization_bank_rule_name,
			number_of_days: number_of_days,
		})
		.then((r) => {
			initHandsontableInstance(r.message, organization_bank_rule_name);
		});
}

// оборачиваем реальный обновлятор в debounce
const debouncedUpdate = debounce((rule, number_of_days) => {
	frappe.show_alert({
		message: __("Data updated"),
		indicator: "blue",
	});
	window.setup_excel_editor_table(rule, number_of_days);
}, 1000); // 5 сек

frappe.realtime.on("budget_data_updated", (msg) => {
	// обновление только нужного
	if (window.organization_bank_rule_name !== msg.organization_bank_rule_name) {
		return;
	}
	// если придёт 100 событий подряд, за 5 сек вызовется только один раз
	debouncedUpdate(msg.organization_bank_rule_name, window.current_number_of_days_select || "7");
});

window.setup_excel_editor_table = setup_excel_editor_table;
attachResizeListener();
