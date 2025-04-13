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
		// Если дошли до конца или дата изменилась
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
 * и соответствующим типом операции (в колонке 1).
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
				// Получаем индекс последней строки выделенного диапазона
				let selectedIndexRow = selection[selection.length - 1].end.row;
				const hot = window.hotInstance;

				// Получаем исходные данные таблицы с восстановленными датами
				let tableData = restoreDatesInData(hot.getSourceData());

				// Создаем копию выбранной строки и обновляем тип операции (предполагается, что колонка 1 - это тип операции)
				let newRow = [...tableData[selectedIndexRow]];
				newRow[1] = opType;

				// Добавляем новую строку в конец массива данных
				tableData.push(newRow);

				// Сортируем данные по дате (колонка 0) в порядке возрастания.
				tableData.sort((a, b) => {
					const dateCompare = a[0].localeCompare(b[0]);
					if (dateCompare !== 0) return dateCompare;
					// Получаем позиции типов из массива operationTypeNames.
					let aTypeIndex = operationTypeNames.indexOf(a[1]);
					let bTypeIndex = operationTypeNames.indexOf(b[1]);
					return aTypeIndex - bTypeIndex;
				});

				// Загружаем отсортированные данные и обновляем настройки объединения ячеек
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
 * Инициализирует или обновляет Handsontable с полученными данными и настройками.
 * @param {Object} message - Данные и настройки, полученные с сервера.
 */
function initHandsontableInstance(message) {
	const mergeCellsConfig = getMergeCellsConfig(message.data);
	const hiddenColumnsIndices = getHiddenColumnsIndices(message.colHeaders);
	const { width, height } = calculateDimensions();
	const contextMenuSettings = getContextMenuSettings(message.operationTypeNames);

	// Если экземпляр уже создан, обновляем его настройки и данные, иначе создаем новый.
	if (window.hotInstance) {
		window.hotInstance.updateSettings({
			data: message.data,
			mergeCells: mergeCellsConfig,
			columns: message.columns,
			colHeaders: message.colHeaders,
			width: width,
			height: height,
			contextMenu: contextMenuSettings,
			hiddenColumns: {
				columns: hiddenColumnsIndices,
				indicators: false,
			},
			viewportColumnRenderingOffset: 0,
			viewportRowRenderingOffset: 0,
		});
		// Обновляем данные через loadData, чтобы гарантировать актуальность.
		window.hotInstance.loadData(message.data);
	} else {
		window.hotInstance = new Handsontable(container, {
			data: message.data,
			columns: message.columns,
			fixedColumnsStart: 2,
			rowHeaders: true,
			autoWrapRow: true,
			autoWrapCol: true,
			colWidths: [105, 50].concat(
				Array.from(
					{ length: message.columns.length - 2 },
					(_, i) => [100, 150, 150][i % 3],
				),
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
			afterGetColHeader: function (col, TH) {
				if (col >= 0) {
					TH.style.fontWeight = 'bold';
					TH.style.textAlign = 'center';
					const headerText = TH.innerText || '';
					if (
						headerText.includes(__('Comment')) ||
						headerText.includes(__('Description'))
					) {
						TH.style.backgroundColor = '#FFCCCC';
					} else {
						TH.style.backgroundColor = '#d3d3d3';
					}
				}
			},
			licenseKey: 'non-commercial-and-evaluation',
		});
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
			initHandsontableInstance(r.message);
		});
}

window.setup_excel_editor_table = setup_excel_editor_table;
attachResizeListener();
