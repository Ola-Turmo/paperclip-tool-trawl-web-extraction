export interface TableDetectionResult {
  tables: Array<{
    headers: string[];
    rows: string[][];
    confidence: number;
  }>;
}

/**
 * Detects tables in HTML content
 */
export function detectTables(html: string): TableDetectionResult {
  const tables: TableDetectionResult['tables'] = [];
  
  // Match table elements
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const tableData = parseTable(tableHtml);
    
    if (tableData.headers.length > 0 || tableData.rows.length > 0) {
      // Calculate confidence based on table structure
      const confidence = calculateTableConfidence(tableData);
      tables.push({
        ...tableData,
        confidence,
      });
    }
  }

  return { tables };
}

/**
 * Extracts data from a specific table by index
 */
export function extractTableData(html: string, tableIndex: number): TableDetectionResult {
  const allTables = detectTables(html);
  
  if (tableIndex < 0 || tableIndex >= allTables.tables.length) {
    return { tables: [] };
  }

  return {
    tables: [allTables.tables[tableIndex]],
  };
}

interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function parseTable(tableHtml: string): ParsedTable {
  const headers: string[] = [];
  const rows: string[][] = [];

  // Extract thead
  const theadMatch = /<thead[^>]*>([\s\S]*?)<\/thead>/i.exec(tableHtml);
  if (theadMatch) {
    const headerCells = extractCells(theadMatch[1], ['th', 'td']);
    headers.push(...headerCells);
  }

  // Extract tbody
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableHtml);
  const rowsHtml = tbodyMatch ? tbodyMatch[1] : tableHtml;

  // Extract all rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(rowsHtml)) !== null) {
    const cells = extractCells(rowMatch[1], ['td', 'th']);
    if (cells.length > 0) {
      // If no thead, use first row as headers
      if (headers.length === 0 && rows.length === 0 && cells.length > 0) {
        headers.push(...cells);
      } else {
        rows.push(cells);
      }
    }
  }

  return { headers, rows };
}

function extractCells(rowHtml: string, cellTags: string[]): string[] {
  const cells: string[] = [];

  for (const tag of cellTags) {
    const cellRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const cellContent = stripHtml(cellMatch[1]).trim();
      cells.push(cellContent);
    }
  }

  return cells;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
    .replace(/&amp;/g, '&') // Replace &amp; with &
    .replace(/&lt;/g, '<')  // Replace &lt; with <
    .replace(/&gt;/g, '>')  // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/\s+/g, ' ')   // Normalize whitespace
    .trim();
}

function calculateTableConfidence(tableData: ParsedTable): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence if we have headers
  if (tableData.headers.length > 0) {
    confidence += 0.2;
  }

  // Increase confidence based on row count
  if (tableData.rows.length > 0) {
    confidence += Math.min(0.15, tableData.rows.length * 0.02);
  }

  // Check for consistent column counts
  if (tableData.rows.length > 0) {
    const expectedCols = tableData.headers.length || tableData.rows[0].length;
    const consistentRows = tableData.rows.filter(row => row.length === expectedCols).length;
    const consistencyRatio = consistentRows / tableData.rows.length;
    confidence *= (0.7 + 0.3 * consistencyRatio);
  }

  // Check for non-empty cells
  const nonEmptyCells = tableData.rows.flat().filter(cell => cell.length > 0).length;
  const totalCells = tableData.rows.length * (tableData.headers.length || 1);
  if (totalCells > 0) {
    const fillRatio = nonEmptyCells / totalCells;
    confidence *= (0.6 + 0.4 * fillRatio);
  }

  return Math.round(confidence * 1000) / 1000;
}
