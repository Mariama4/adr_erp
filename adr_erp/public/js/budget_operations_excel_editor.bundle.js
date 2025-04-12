import Handsontable from 'handsontable';

const container = document.querySelector('.budget_operations_excel_editor_table');
const mainSection = document.querySelector('body > div.main-section');
const bodySidebar = document.querySelector('body > div.body-sidebar-container');
const stickyTop = document.querySelector('body > div.main-section > div.sticky-top');
const bodyEl = document.querySelector('#body');

window.hotInstance = null;

/**
 * Вычисляет конфигурацию объединения ячеек для столбца "Дата"
 * @param {Array} data - Массив данных таблицы.
 * @returns {Array} mergeCells - Конфигурация объединения ячеек.
 */
function getMergeCellsConfig(data) {
	const mergeCells = [];
	let startRow = 0;
	let currentDate = data[0][0];
	let rowspan = 1;

	for (let i = 1; i < data.length; i++) {
		if (data[i][0] === currentDate) {
			rowspan++;
		} else {
			if (rowspan > 1) {
				mergeCells.push({
					row: startRow,
					col: 0,
					rowspan: rowspan,
					colspan: 1,
				});
			}
			startRow = i;
			currentDate = data[i][0];
			rowspan = 1;
		}
	}
	if (rowspan > 1) {
		mergeCells.push({ row: startRow, col: 0, rowspan: rowspan, colspan: 1 });
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
 * В добавок, если expense item может быть транзитным (то есть в соседней колонке присутствует слово "Transit"),
 * то диапазон поиска скрытых колонок расширяется с 3 до 4 колонок.
 * @returns {Object} contextMenuSettings
 */
function getContextMenuSettings() {
	return {
		items: {
			add_col_comment: {
				name: __('Add comment'),
				callback: function (key, selection) {
					// Получаем текущие скрытые колонки из настроек
					let hiddenCols = this.getSettings().hiddenColumns.columns || [];
					// Копия массива, чтобы не модифицировать исходный
					let newHiddenCols = Array.isArray(hiddenCols) ? [...hiddenCols] : [];

					selection.forEach((sel) => {
						let targetCol = sel.end.col;
						// Определяем базовый диапазон поиска
						let checkRange = 3;
						// Если рядом с текущей позицией есть колонка с "Transit",
						// расширяем диапазон поиска до 4 колонок
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
		},
	};
}

/**
 * Инициализирует Handsontable с полученными данными и настройками.
 * @param {Object} message - Данные и настройки, полученные с сервера.
 */
function initHandsontableInstance(message) {
	const mergeCellsConfig = getMergeCellsConfig(message.data);
	const hiddenColumnsIndices = getHiddenColumnsIndices(message.colHeaders);
	const { width, height } = calculateDimensions();
	const contextMenuSettings = getContextMenuSettings();

	if (window.hotInstance) {
		window.hotInstance.destroy();
	}

	window.hotInstance = new Handsontable(container, {
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
		licenseKey: 'non-commercial-and-evaluation',
	});

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
 * Основная функция для инициализации Excel-редактора.
 * Запрашивает данные с сервера и отображает их в Handsontable.
 *
 * В дальнейшем сюда можно добавить функционал для отправки данных на сервер и синхронизации изменений между пользователями.
 *
 * @param {String} organization_bank_rule_name - Имя документа правил организации.
 */
function setupExcelEditorTable(organization_bank_rule_name) {
	frappe
		.call('adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable', {
			organization_bank_rule_name: organization_bank_rule_name,
		})
		.then((r) => {
			initHandsontableInstance(r.message);
		});
}

window.setup_excel_editor_table = setupExcelEditorTable;
attachResizeListener();
