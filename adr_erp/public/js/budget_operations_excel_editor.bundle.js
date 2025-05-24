import Handsontable from 'handsontable';

import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';

const container = document.querySelector('.budget_operations_excel_editor_table');
const page_form = document.querySelector('.page-form');
const bodySidebar = document.querySelector('body > div.body-sidebar-container');
const mainSection = document.querySelector('body > div.main-section');
const stickyTop = document.querySelector('body > div.main-section > div.sticky-top');
const bodyEl = document.querySelector('#body');

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
	const rowCount = data.length;
	const colCount = data[0].length; // число столбцов в строке
	let start = 0;

	for (let i = 1; i <= rowCount; i++) {
		const current = i < rowCount ? data[i][dateColIndex] : null;
		if (i === rowCount || current !== data[start][dateColIndex]) {
			const span = i - start;
			if (span > 1) {
				// массив нужных смещений относительно dateColIndex
				[0, 3, 4, 5, 6].forEach((offset) => {
					const col = dateColIndex + offset;
					// проверяем, что столбец существует и слияние не выходит за последнюю строку
					if (col < colCount && start + span <= rowCount) {
						merge.push({
							row: start,
							col: col,
							rowspan: span,
							colspan: 1,
						});
					}
				});
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
		console.log(header);
		if (
			header.includes(__('Comment')) &&
			!data.some((row) => row[index] != null && row[index] !== '')
		) {
			acc.push(index);
		}
		if (header.includes('Name') && header.endsWith('Name')) {
			acc.push(index);
		}
		if (header == __('Group Index')) {
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
	// 1) Безопасно достаём размеры элементов (если элемента нет — 0)
	const sidebarWidth = bodySidebar?.clientWidth ?? 0;
	const mainHeight = mainSection?.clientHeight ?? 0;
	const stickyHeight = stickyTop?.clientHeight ?? 0;
	const bodyHeightVal = bodyEl?.clientHeight ?? 0;
	const formWidth = page_form?.clientWidth ?? 0;

	// 2) Первый вариант: полная ширина минус сайдбар, а высота — внутри main
	let width = window.innerWidth - sidebarWidth;
	let height = mainHeight - stickyHeight - bodyHeightVal;

	// 3) Если вышло ≤0, пробуем подстроиться под форму
	if (width <= 0 || height <= 0) {
		width = formWidth || window.innerWidth;
		// высота = экран минус header-панель (mainSection) и небольшой отступ
		height = window.innerHeight - mainHeight - 15 || window.innerHeight;
	}

	// 4) Финальный фоллбэк: займём весь экран
	if (width <= 0 || height <= 0) {
		width = window.innerWidth;
		height = window.innerHeight;
	}

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
					method: 'adr_erp.budget.budget_api.save_budget_changes',
					args: { organization_bank_rule_name, changes: payload },
				});
			},
		};
	});

	return {
		items: {
			add_col_comment: {
				name: __('Add comment'),
				callback: function (key, selection) {
					let hiddenCols = this.getSettings().hiddenColumns.columns || [];
					let newHiddenCols = Array.isArray(hiddenCols) ? [...hiddenCols] : [];
					selection.forEach((sel) => {
						let targetCol = sel.end.col;
						let checkRange = 3;
						const nextColHeader = this.getColHeader(targetCol + 1);
						if (nextColHeader && nextColHeader.includes(__('Transit'))) {
							checkRange = 4;
						}
						while (
							targetCol < this.countCols() &&
							targetCol < sel.end.col + checkRange
						) {
							if (newHiddenCols.includes(targetCol)) {
								newHiddenCols = newHiddenCols.filter(
									(colIndex) => colIndex !== targetCol,
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
function initHandsontableInstance(message, organization_bank_rule_name, force_render = false) {
	console.log(message);
	const raw = (message.data || []).map((r) => [...r]);
	const data = restoreDatesInData(raw);
	const colHeaders = message.colHeaders || [];
	console.log(data, colHeaders);
	const cols = message.columns || [];
	const opTypes = Array.isArray(message.operationTypeNames) ? message.operationTypeNames : [];

	const colsMetaSettings = cols;
	const dateColIndex = cols.findIndex((c) => c.field === 'date');

	const mergeCells = getMergeCellsConfig(data, dateColIndex);
	const hiddenCols = getHiddenColumnsIndices(colHeaders, data);
	console.log(mergeCells, hiddenCols);
	const { width, height } = calculateDimensions();
	const contextMenuSettings = getContextMenuSettings(opTypes, organization_bank_rule_name);
	const todayStr = new Date().toISOString().slice(0, 10);

	// Проверяем изменение размерности: если ряды или колонки изменились, принудительно рендерим заново
	let needFullRender = force_render;
	if (window.hotInstance && !force_render) {
		const currentData = window.hotInstance.getSourceData();
		const currentRowCount = currentData.length;
		const currentColCount = Array.isArray(currentData[0])
			? currentData[0].length
			: window.hotInstance.countCols();
		const newRowCount = message.data.length;
		const newColCount = cols.length;
		if (currentRowCount !== newRowCount || currentColCount !== newColCount) {
			needFullRender = true;
		}
	}

	const groups = {};
	data.forEach((row, idx) => {
		const key = `${row[0]}|${row[2]}`;
		if (!groups[key]) groups[key] = [];
		groups[key].push(idx);
	});

	const groupRanges = {};
	const groupIndexMap = {};
	Object.values(groups).forEach((indices, groupIdx) => {
		const start = indices[0];
		const end = indices[indices.length - 1];
		indices.forEach((i) => {
			groupRanges[i] = { from: start, to: end };
			groupIndexMap[i] = groupIdx;
		});
	});

	// узнаем границы по колонкам (тут – от первой до последней)
	const firstCol = 0;
	const lastCol = (colsMetaSettings.length || data[0].length) - 1;

	const hotSettings = {
		data: message.data,
		columns: message.columns,
		fixedColumnsStart: 2,
		rowHeaders: true,
		autoWrapRow: true,
		autoWrapCol: true,
		manualColumnResize: true,
		colWidths: [105, 60, 60, 105, 105, 105, 105].concat(
			Array.from({ length: message.columns.length - 2 }, (_, i) => [100, 150, 150][i % 3]),
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
			console.log('afterGetColHeader start');
			if (col >= 0) {
				TH.style.fontWeight = 'bold';
				TH.style.textAlign = 'center';
				const headerText = TH.innerText || '';
				if (headerText.includes(__('Comment')) || headerText.includes(__('Description'))) {
					TH.style.backgroundColor = '#FFCCCC';
				} else {
					TH.style.backgroundColor = '#d3d3d3';
				}
				console.log('afterGetColHeader - ', TH.style.backgroundColor);
			}
			console.log('afterGetColHeader end');
		},
		cells: function (row, col, prop) {
			const cellMeta = {};
			// if (col === dateColIndex) {
			cellMeta.renderer = function (hotInst, TD, r, c, prop, value, cellProps) {
				// 1) стандартная отрисовка текста и базовых стилей
				Handsontable.renderers.TextRenderer.apply(this, arguments);

				// 2) каждый раз очищаем фон
				TD.style.backgroundColor = '';

				// 2) фон для каждой второй группы
				const groupIdx = groupIndexMap[r];
				if (groupIdx !== undefined && groupIdx % 2 === 1 && col > 6) {
					TD.style.backgroundColor = 'rgba(174, 174, 174, 0.2)';
				} else {
					TD.style.backgroundColor = '';
				}

				// 3) зелёная подсветка сегодняшней даты (перекрывает серый)
				if (c === dateColIndex && value === todayStr) {
					TD.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
				}

				// 4) рамки по группам
				const range = groupRanges[r];
				if (range) {
					const b = '1px solid #000';
					// сброс всех сторон
					TD.style.border = '';
					if (c === firstCol) TD.style.borderLeft = b;
					if (c === lastCol) TD.style.borderRight = b;
					if (r === range.from) TD.style.borderTop = b;
					if (r === range.to) TD.style.borderBottom = b;
				}
			};
			// }
			return cellMeta;
		},
		// Обработчик изменений в таблице. Если изменения были внесены пользователем,
		// собираем payload и отправляем на сервер.
		afterChange: (changes, source) => {
			if (!changes || !['edit', 'CopyPaste.paste'].includes(source)) return;
			// Получаем свежие данные с учётом восстановления дат
			const freshRaw = window.hotInstance.getSourceData().map((r) => [...r]);
			const freshData = restoreDatesInData(freshRaw);

			// Индекс даты
			const dateIdx = colsMetaSettings.findIndex((c) => c.field === 'date');
			const rowCount = freshData.length;
			const colCount = colsMetaSettings.length;

			// Сначала строим маппинг rowIndex -> порядковый номер в группе (date|type)
			const rowOrdinalMap = {};
			freshData.forEach((row, idx) => {
				rowOrdinalMap[idx] = row[2];
			});

			// Группируем изменения по строке и expense_item
			const groups = {};
			changes.forEach(([row, col]) => {
				if (row < 0 || row >= rowCount || col < 0 || col >= colCount) {
					// пропускаем некорректные координаты
					return;
				}
				const field = colsMetaSettings[col].field;
				const base = field.split('_')[0];
				const key = `${row}|${base}`;
				groups[key] = row;
			});

			// Формируем payload для каждой группы
			const payload = Object.keys(groups).map((key) => {
				const rowIndex = groups[key];
				const rowArr = freshData[rowIndex];
				const date = rowArr[dateIdx];
				const budget_type = rowArr[1];
				const base = key.split('|')[1];

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
				method: 'adr_erp.budget.budget_api.save_budget_changes',
				args: { organization_bank_rule_name, changes: payload },
			});
		},

		licenseKey: 'non-commercial-and-evaluation',
	};

	if (window.hotInstance && needFullRender) {
		window.hotInstance.updateSettings(hotSettings);
		window.hotInstance.loadData(message.data);
	} else if (window.hotInstance) {
		safeUpdateInstance(
			{
				data,
			},
			hotSettings,
		);
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
	const month = (now.getMonth() + 1).toString().padStart(2, '0');
	const day = now.getDate().toString().padStart(2, '0');
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
	window.addEventListener('resize', () => {
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
function setup_excel_editor_table(
	organization_bank_rule_name,
	number_of_days,
	force_render = false,
) {
	if (organization_bank_rule_name == undefined || number_of_days == undefined) {
		return Promise.reject();
	}
	return frappe
		.call('adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable', {
			organization_bank_rule_name: organization_bank_rule_name,
			number_of_days: number_of_days,
		})
		.then((r) => {
			initHandsontableInstance(r.message, organization_bank_rule_name, force_render);
		});
}

function safeUpdateInstance(message, hotSettings) {
	const hot = window.hotInstance;
	const editor = hot.getActiveEditor();
	// Если редактор открыт — отложить до afterClose
	if (editor && editor.isOpened()) {
		editor.addHook('afterClose', () => {
			safeUpdateInstance(message, hotSettings);
		});
		return;
	}

	// 1) обновляем структуру (столбцы, заголовки, объединения, скрытые колонки и прочие настройки), но без data
	const settingsNoData = { ...hotSettings };
	delete settingsNoData.data;
	hot.updateSettings(settingsNoData);

	// 2) «диффовое» обновление значений
	performUpdateData(message.data);
}

function performUpdateData(newData) {
	const hot = window.hotInstance;
	hot.batch(() => {
		hot.populateFromArray(0, 0, newData, null, { updateOnDemand: true });
	});
}

// оборачиваем реальный обновлятор в debounce
const debouncedUpdate = debounce((rule, number_of_days) => {
	frappe.show_alert({
		message: __('Data updated'),
		indicator: 'blue',
	});
	window.setup_excel_editor_table(rule, number_of_days);
}, 1000);

function forceReload() {
	frappe.msgprint({
		title: __('Force Data Update'),
		message: __('The page will reload in 5 seconds'),
		indicator: 'red', // красный заголовок
	});
	setTimeout(() => {
		window.location.reload(true);
	}, 5000);
}

const debouncedForceReload = debounce(forceReload, 1000);

frappe.realtime.on('budget_data_updated', (msg) => {
	// обновление только нужного
	if (window.current_organization_bank_rules_select != msg.organization_bank_rule_name) {
		return;
	}
	// если придёт 100 событий подряд, за 5 сек вызовется только один раз
	debouncedUpdate(msg.organization_bank_rule_name, window.current_number_of_days_select || '7');
});

frappe.realtime.on('require_budget-operations-excel-editor_refresh', (msg) => {
	debouncedForceReload();
});

window.setup_excel_editor_table = setup_excel_editor_table;
attachResizeListener();

// Функция загрузки с retry
function loadDataWithRetry(retries = 3, delay = 100) {
	window
		.setup_excel_editor_table(
			window.current_organization_bank_rules_select,
			window.current_number_of_days_select,
		)
		.catch((err) => {
			if (retries > 0) {
				console.warn(`Load failed, retrying in ${delay}ms...`, err);
				setTimeout(() => loadDataWithRetry(retries - 1, delay * 2), delay);
			} else {
				frappe.msgprint({
					title: __('Error loading data'),
					message: __('Failed to load data after multiple servers.'),
					indicator: 'red',
				});
			}
		});
}

// Запуск после готовности DOM
if (document.readyState === 'complete' || document.readyState === 'interactive') {
	loadDataWithRetry();
} else {
	document.addEventListener('DOMContentLoaded', loadDataWithRetry);
}
