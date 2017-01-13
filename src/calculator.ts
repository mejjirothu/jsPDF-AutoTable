import {Config, FONT_ROW_RATIO} from './config';
import {getStringWidth, ellipsize} from './common';
import {Row, Table} from "./models";

declare function require(path: string): any;
var entries = require('object.entries');

/**
 * Calculate the column widths
 */
export function calculateWidths(table: Table) {
    // Column and table content width
    let fixedWidth = 0;
    let autoWidth = 0;
    let dynamicColumns = [];
    table.columns.forEach(function (column) {
        column.contentWidth = 0;
        table.rows.concat(table.headerRow).forEach(function (row) {
            let cell = row.cells[column.dataKey];
            cell.contentWidth = cell.padding('horizontal') + getStringWidth(cell.text, cell.styles);
            if (cell.colSpan <= 1 && cell.contentWidth > column.contentWidth) {
                column.contentWidth = cell.contentWidth;
            }
        });
        table.contentWidth += column.contentWidth;
        if (typeof column.widthStyle === 'number') {
            column.preferredWidth = column.widthStyle;
            fixedWidth += column.preferredWidth;
            column.width = column.preferredWidth;
        } else if (column.widthStyle === 'wrap') {
            column.preferredWidth = column.contentWidth;
            fixedWidth += column.preferredWidth;
            column.width = column.preferredWidth;
        } else {
            column.preferredWidth = column.contentWidth;
            autoWidth += column.contentWidth;
            dynamicColumns.push(column);
        }
        table.preferredWidth += column.preferredWidth;
    });

    if (typeof table.settings.tableWidth === 'number') {
        table.width = table.settings.tableWidth;
    } else if (table.settings.tableWidth === 'wrap') {
        table.width = table.preferredWidth;
    } else {
        let pageWidth = Config.pageSize().width;
        table.width = pageWidth - table.margin('left') - table.margin('right');
    }

    distributeWidth(dynamicColumns, fixedWidth, autoWidth, 0);

    let rowSpanCell = null;
    let combinedRowSpanHeight = 0;
    let rowSpansLeft = 0;
    
    // Row height, table height and text overflow
    let all = table.rows.concat(table.headerRow);
    for (var rowIndex = 0; rowIndex < all.length; rowIndex++) {
        var row = all[rowIndex];
        
        let colSpanCell = null;
        let combinedColSpanWidth = 0;
        let colSpansLeft = 0;
        for (var columnIndex = 0; columnIndex < table.columns.length; columnIndex++) {
            let col = table.columns[columnIndex];
            
            // Width and colspan
            colSpansLeft -= 1;
            if (colSpansLeft > 1 && table.columns[columnIndex + 1]) {
                combinedColSpanWidth += col.width;
                delete row.cells[col.dataKey];
                continue;
            } else if (colSpanCell) {
                var cell = colSpanCell;
                delete row.cells[col.dataKey];
                colSpanCell = null;
            } else {
                var cell = row.cells[col.dataKey];
                colSpansLeft = cell.colSpan;
                combinedColSpanWidth = 0;
                if (cell.colSpan > 1) {
                    colSpanCell = cell;
                    combinedColSpanWidth += col.width;
                    continue;
                } 
            }
            cell.width = col.width + combinedColSpanWidth;

            // Overflow
            Config.applyStyles(cell.styles);
            let textSpace = cell.width - cell.padding('horizontal');
            if (cell.styles.overflow === 'linebreak') {
                cell.text = Array.isArray(cell.text) ? cell.text.join(' ') : cell.text;
                // Add one pt to textSpace to fix rounding error
                cell.text = table.doc.splitTextToSize(cell.text, textSpace + 1, {fontSize: cell.styles.fontSize});
            } else if (cell.styles.overflow === 'ellipsize') {
                cell.text = ellipsize(cell.text, textSpace, cell.styles);
            } else if (cell.styles.overflow === 'hidden') {
                cell.text = ellipsize(cell.text, textSpace, cell.styles, '');
            } else if (typeof cell.styles.overflow === 'function') {
                cell.text = cell.styles.overflow(cell.text, textSpace);
            }
            
            let lineCount = Array.isArray(cell.text) ? cell.text.length : 1;
            let fontHeight = cell.styles.fontSize / Config.scaleFactor() * FONT_ROW_RATIO;
            cell.contentHeight = lineCount * fontHeight + cell.padding('vertical');

            if (cell.rowSpan <= 1 && cell.contentHeight > row.height) {
                row.height = cell.contentHeight
            }

            cell.height = row.height + combinedRowSpanHeight;
            
            if (cell.height > row.maxCellHeight) {
                row.maxCellHeight = cell.height;
                row.maxCellLineCount = lineCount;
            }
        }
        
        table.height += row.height;
    }
}

function distributeWidth(dynamicColumns, staticWidth, dynamicColumnsContentWidth, fairWidth) {
    let table = Config.tableInstance();
    let extraWidth = table.width - staticWidth - dynamicColumnsContentWidth;
    for (let i = 0; i < dynamicColumns.length; i++) {
        let col = dynamicColumns[i];
        let ratio = col.contentWidth / dynamicColumnsContentWidth;
        // A column turned out to be none dynamic, start over recursively
        let isNoneDynamic = col.contentWidth + extraWidth * ratio < fairWidth;
        if (extraWidth < 0 && isNoneDynamic) {
            dynamicColumns.splice(i, 1);
            dynamicColumnsContentWidth -= col.contentWidth;
            col.width = fairWidth;
            staticWidth += col.width;
            distributeWidth(dynamicColumns, staticWidth, dynamicColumnsContentWidth, fairWidth);
            break;
        } else {
            col.width = col.contentWidth + extraWidth * ratio;
        }
    }
}