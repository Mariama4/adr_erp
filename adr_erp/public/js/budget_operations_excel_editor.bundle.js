import Handsontable from 'handsontable';
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";

const container = document.querySelector('.budget_operations_excel_editor_table');

// Сформировать заголовки

frappe.call('adr_erp.budget.budget_api.get_budget_plannig_data_for_handsontable')
 .then(r => {
  
  const hiddenColumnsIndices = r.message.colHeaders.reduce((acc, header, index) => {
    if (header.includes("Комментарий")) {
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
          mergeCells.push({ row: startRow, col: 0, rowspan: rowspan, colspan: 1 });
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

  const hot = new Handsontable(container, {
    data: r.message.data,
    startRows: 200,
    startCols: r.message.colHeaders.length,
    autoWrapRow: true,
    autoWrapCol: true,
    nestedRows: true,
    // columns: [
    //   { data: 'id', type: 'numeric' },
    //   { data: 'name', type: 'text' }
    // ],
    colHeaders: r.message.colHeaders,
    mergeCells: mergeCellsConfig,
    width: container.width, // Устанавливаем ширину контейнера
    height: container.height, // Устанавливаем высоту контейнера
    licenseKey: 'non-commercial-and-evaluation',
    hiddenColumns: {
      columns: hiddenColumnsIndices,
      indicators: false // не отображать индикаторы скрытых колонок
    },
    afterGetColHeader: function(col, TH) {
      if (col >= 0) {
        TH.style.fontWeight = 'bold';
        TH.style.textAlign = 'center';
        // Получаем текст заголовка
        const headerText = TH.innerText || "";
        // Если в тексте есть "Комментарий" или "Описание", устанавливаем мягко-красный фон
        if (headerText.includes("Комментарий") || headerText.includes("Описание")) {
          TH.style.backgroundColor = '#FFCCCC';
        } else {
          TH.style.backgroundColor = '#d3d3d3';
        }
      }
    }
  });
 })