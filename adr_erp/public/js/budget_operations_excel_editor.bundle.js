import Handsontable from 'handsontable';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';

const container = document.querySelector('.budget_operations_excel_editor_table');

const main_section = document.querySelector('body > div.main-section');
const body_sidebar = document.querySelector('body > div.body-sidebar-container');
const sticky_top = document.querySelector('body > div.main-section > div.sticky-top');
const body = document.querySelector('#body');

window.hotInstance = null;

function setup_excel_editor_table(organization_bank_rule_name) {
	frappe
		.call('adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable', {
			organization_bank_rule_name: organization_bank_rule_name,
		})
		.then((r) => {
			const hiddenColumnsIndices = r.message.colHeaders.reduce((acc, header, index) => {
				if (header.includes('Комментарий')) {
					acc.push(index);
				}
				return acc;
			}, []);

			// Функция для вычисления конфигурации объединения ячеек в колонке "Дата"
			function getMergeCellsConfig(data) {
				const mergeCells = [];
				let startRow = 0;
				let currentDate = data[0][0];
				let rowspan = 1;

				for (let i = 1; i < data.length; i++) {
					if (data[i][0] === currentDate) {
						rowspan++;
					} else {
						// Если в группе больше одной строки – добавляем объединение
						if (rowspan > 1) {
							mergeCells.push({
								row: startRow,
								col: 0,
								rowspan: rowspan,
								colspan: 1,
							});
						}
						// Сброс группы
						startRow = i;
						currentDate = data[i][0];
						rowspan = 1;
					}
				}
				// Проверка последней группы
				if (rowspan > 1) {
					mergeCells.push({ row: startRow, col: 0, rowspan: rowspan, colspan: 1 });
				}
				return mergeCells;
			}

			// Вычисляем конфигурацию объединения ячеек для данных
			const mergeCellsConfig = getMergeCellsConfig(r.message.data);

			if (window.hotInstance) {
				window.hotInstance.destroy();
			}

			const contextMenuSettings = {
				items: {
					add_col_comment: {
						name: __('Add comment'),
						callback: function (key, selection, clickEvent) {
							// Получаем текущий массив скрытых колонок из настроек
							let hiddenCols = this.getSettings().hiddenColumns.columns || [];
							// Создаем копию массива, чтобы не изменять исходный напрямую
							let newHiddenCols = Array.isArray(hiddenCols) ? [...hiddenCols] : [];

							// Для каждого выделения ищем скрытую колонку в пределах 3 колонок справа от точки нажатия
							selection.forEach((sel) => {
								// Начинаем с колонки, в которой завершено выделение
								let targetCol = sel.end.col;
								let found = false;
								// Ограничиваем поиск диапазоном: от sel.end.col до sel.end.col + 2 (всего 3 колонки)
								while (
									targetCol < this.countCols() &&
									targetCol < sel.end.col + 4
								) {
									if (newHiddenCols.includes(targetCol)) {
										// Удаляем найденную колонку из массива скрытых колонок
										newHiddenCols = newHiddenCols.filter(
											(colIndex) => colIndex !== targetCol,
										);
										found = true;
										break; // Прерываем поиск для текущего выделения
									}
									targetCol++;
								}
							});

							// Обновляем настройки, убираем найденные скрытые колонки
							this.updateSettings({
								hiddenColumns: {
									columns: newHiddenCols,
									indicators: true, // отображаем индикаторы скрытых колонок, если требуется
								},
							});
						},
					},
				},
			};

			const calculatedWidth = window.innerWidth - body_sidebar.clientWidth;
			const calculatedHeight =
				main_section.clientHeight - sticky_top.clientHeight - body.clientHeight;

			window.hotInstance = new Handsontable(container, {
				data: r.message.data,
				columns: r.message.columns,
				fixedColumnsStart: 2,
				rowHeaders: true,
				autoWrapRow: true,
				autoWrapCol: true,
				colWidths: [105, 50].concat(
					Array.from(
						{ length: r.message.columns.length - 2 },
						(_, i) => [100, 150, 150][i % 3],
					),
				),
				colHeaders: r.message.colHeaders,
				mergeCells: mergeCellsConfig,
				width: calculatedWidth, // Устанавливаем ширину контейнера
				height: calculatedHeight, // Устанавливаем высоту контейнера
				contextMenu: contextMenuSettings,
				hiddenColumns: {
					columns: hiddenColumnsIndices,
					indicators: true, // не отображать индикаторы скрытых колонок
				},
				afterGetColHeader: function (col, TH) {
					if (col >= 0) {
						TH.style.fontWeight = 'bold';
						TH.style.textAlign = 'center';
						// Получаем текст заголовка
						const headerText = TH.innerText || '';
						// Если в тексте есть "Комментарий" или "Описание", устанавливаем мягко-красный фон
						if (
							headerText.includes('Комментарий') ||
							headerText.includes('Описание')
						) {
							TH.style.backgroundColor = '#FFCCCC';
						} else {
							TH.style.backgroundColor = '#d3d3d3';
						}
					}
				},
				licenseKey: 'non-commercial-and-evaluation',
			});

			let date = new Date();

			let year = date.getFullYear();
			let month = (date.getMonth() + 1).toString().padStart(2, '0');
			let day = date.getDate().toString().padStart(2, '0');

			let currentDate = `${year}-${month}-${day}`;
			let rowIndex = window.hotInstance
				.getSourceData()
				.findIndex((row) => row[0] === currentDate);
			if (rowIndex >= 0) {
				window.hotInstance.scrollViewportTo(rowIndex);
			} else {
				console.log('Строка с заданным значением не найдена');
			}
		});
}

window.setup_excel_editor_table = setup_excel_editor_table;

window.addEventListener('resize', () => {
	if (window.hotInstance) {
		const newWidth = window.innerWidth - body_sidebar.clientWidth;
		const newHeight = main_section.clientHeight - sticky_top.clientHeight - body.clientHeight;
		window.hotInstance.updateSettings({
			width: newWidth,
			height: newHeight,
		});
	}
});
