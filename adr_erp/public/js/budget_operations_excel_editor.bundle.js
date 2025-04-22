import Handsontable from 'handsontable';

const container = document.querySelector('.budget_operations_excel_editor_table');
const mainSection = document.querySelector('body > div.main-section');
const bodySidebar = document.querySelector('body > div.body-sidebar-container');
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
	for (let i = 0; i < data.length; i++) {
		if (data[i][0]) {
			lastDate = data[i][0];
		} else {
			data[i][0] = lastDate;
		}
	}
	return data;
}

/**
 * Вычисляет конфигурацию объединения ячеек для столбца "Дата"
 * @param {Array} data - Массив данных таблицы.
 * @returns {Array} mergeCells - Конфигурация объединения ячеек.
 */
function getMergeCellsConfig(data) {
	if (!Array.isArray(data) || data.length === 0) return [];
	const mergeCells = [];
	let startRow = 0;
	// Проходим до i <= data.length для обработки последней группы
	for (let i = 1; i <= data.length; i++) {
		if (i === data.length || data[i][0] !== data[startRow][0]) {
			const groupLength = i - startRow;
			if (groupLength > 1) {
				mergeCells.push({
					row: startRow,
					col: 0,
					rowspan: groupLength,
					colspan: 1,
				});
			}
			startRow = i;
		}
	}
	return mergeCells;
}

/**
 * Определяет индексы столбцов, которые нужно скрыть.
 * @param {Array} colHeaders - Массив заголовков столбцов.
 * @returns {Array} hiddenIndices - Массив индексов скрытых столбцов.
 */
function getHiddenColumnsIndices(colHeaders) {
	return colHeaders.reduce((acc, header, index) => {
		if (header.includes(__('Comment'))) {
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
function getContextMenuSettings(operationTypeNames = []) {
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
				// Создаем новую строку, заполняя все ячейки значением null
				let newRow = Array(hot.getSettings().colHeaders.length).fill(null);
				newRow[0] = selectedRow[0];
				newRow[1] = opType;
				// Добавляем новую строку в конец данных
				tableData.push(newRow);
				// Сортируем данные: сначала по дате, затем по порядку типов (в соответствии с operationTypeNames)
				tableData.sort((a, b) => {
					const dateCompare = a[0].localeCompare(b[0]);
					if (dateCompare !== 0) return dateCompare;
					let aTypeIndex = operationTypeNames.indexOf(a[1]);
					let bTypeIndex = operationTypeNames.indexOf(b[1]);
					return aTypeIndex - bTypeIndex;
				});
				// Обновляем таблицу
				hot.loadData(tableData);
				hot.updateSettings({ mergeCells: getMergeCellsConfig(tableData) });
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
function initHandsontableInstance(message, organization_bank_rule_name) {
	// Если не переданы значения, используем пустые массивы.
	message.data = message.data || [];
	message.columns = message.columns || [];
	message.colHeaders = message.colHeaders || [];

	// Извлекаем массив типов операций
	const opTypes = Array.isArray(message.operationTypeNames) ? message.operationTypeNames : [];

	// Восстанавливаем даты в данных, чтобы не было пропусков в первой колонке.
	message.data = restoreDatesInData(message.data);

	const mergeCellsConfig = getMergeCellsConfig(message.data);
	const hiddenColumnsIndices = getHiddenColumnsIndices(message.colHeaders);
	const { width, height } = calculateDimensions();
	const contextMenuSettings = getContextMenuSettings(opTypes);

	const hotSettings = {
		data: message.data,
		columns: message.columns,
		fixedColumnsStart: 2,
		rowHeaders: true,
		autoWrapRow: true,
		autoWrapCol: true,
		colWidths: [105, 50].concat(
			Array.from({ length: message.columns.length - 2 }, (_, i) => [100, 150, 150][i % 3]),
		),
		colHeaders: message.colHeaders,
		mergeCells: mergeCellsConfig,
		width: width,
		height: height,
		contextMenu: contextMenuSettings,
		hiddenColumns: {
			columns: hiddenColumnsIndices,
			indicators: false,
		},
		viewportColumnRenderingOffset: 0,
		viewportRowRenderingOffset: 0,

		// Блокируем вставку через Ctrl+V в колонках select/dropdown
		beforePaste: function (data, coords) {
			const colsMeta = this.getSettings().columns;

			coords.forEach((range) => {
				const { startRow, startCol, endRow, endCol } = range;

				for (let r = startRow; r <= endRow; r++) {
					for (let c = startCol; c <= endCol; c++) {
						const colMeta = colsMeta[c];
						if (
							colMeta &&
							(colMeta.type === 'dropdown' || colMeta.type === 'select')
						) {
							// вычисляем позицию в data: смещение по рядам и колонкам от начала диапазона
							const dataRow = r - startRow;
							const dataCol = c - startCol;
							// заменяем то, что хотел вставить пользователь, на текущее значение ячейки
							data[dataRow][dataCol] = this.getDataAtCell(r, c);
						}
					}
				}
			});
		},

		afterGetColHeader: function (col, TH) {
			if (col >= 0) {
				TH.style.fontWeight = 'bold';
				TH.style.textAlign = 'center';
				const headerText = TH.innerText || '';
				if (headerText.includes(__('Comment')) || headerText.includes(__('Description'))) {
					TH.style.backgroundColor = '#FFCCCC';
				} else {
					TH.style.backgroundColor = '#d3d3d3';
				}
			}
		},

		// Обработчик изменений в таблице. Если изменения были внесены пользователем,
		// собираем payload и отправляем на сервер.
		afterChange: debounce(function (changes, source) {
			if (!changes || !['edit', 'CopyPaste.paste'].includes(source)) return;

			const hot = window.hotInstance;
			const cols = hot.getSettings().columns;
			// Берём «сырые» данные и делаем их копию, чтобы не портить исходник
			const rawData = hot.getSourceData().map((row) => [...row]);
			// Восстанавливаем даты
			const data = restoreDatesInData(rawData);

			// Составляем массив изменений
			let payload = changes
				.map(([row, col, oldVal, newVal]) => {
					const rowArr = data[row];
					return {
						date: rowArr[0],
						budget_type: rowArr[1],
						field: cols[col].field,
						old_value: oldVal,
						new_value: newVal,
					};
				})
				// Фильтрация «пустых» и несущественных изменений
				.filter(
					({ old_value, new_value }) =>
						!(old_value === null && new_value === '') && old_value !== new_value,
				);

			if (payload.length === 0) {
				console.log('Изменений нет');
				return;
			}

			// Отправляем только изменённые ячейки
			frappe.call({
				method: 'adr_erp.budget.budget_api.save_budget_changes',
				args: {
					organization_bank_rule_name: organization_bank_rule_name,
					changes: payload,
				},
				callback: () => {
					console.log('Изменения отправлены');
				},
			});
		}, 300),

		licenseKey: 'non-commercial-and-evaluation',
	};

	if (window.hotInstance) {
		window.hotInstance.updateSettings(hotSettings);
		window.hotInstance.loadData(message.data);
	} else {
		window.hotInstance = new Handsontable(container, hotSettings);
	}

	scrollToCurrentDate();
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
function setup_excel_editor_table(organization_bank_rule_name) {
	frappe
		.call('adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable', {
			organization_bank_rule_name: organization_bank_rule_name,
		})
		.then((r) => {
			initHandsontableInstance(r.message, organization_bank_rule_name);
		});
}

frappe.realtime.on('budget_data_updated', (msg) => {
	console.log(msg);
	// Только люди с этой вкладкой (где мы подписались) увидят событие
	window.setup_excel_editor_table(msg.organization_bank_rule_name);
});

window.setup_excel_editor_table = setup_excel_editor_table;
attachResizeListener();
