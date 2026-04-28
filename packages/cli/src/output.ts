export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

export interface ColumnDef {
  key: string;
  header: string;
  width?: number;
}

/**
 * Format items as an aligned table with column headers.
 */
export function formatTable(items: any[], columns: ColumnDef[]): string {
  if (items.length === 0) return 'No items.';

  // Determine column widths: max of header length, specified width, or longest value
  const widths = columns.map((col) => {
    const maxVal = items.reduce((max, item) => {
      const val = String(item[col.key] ?? '');
      return Math.max(max, val.length);
    }, 0);
    return col.width ?? Math.max(col.header.length, maxVal);
  });

  const header = columns
    .map((col, i) => col.header.padEnd(widths[i]))
    .join('  ');

  const separator = columns
    .map((_, i) => '-'.repeat(widths[i]))
    .join('  ');

  const rows = items.map((item) =>
    columns
      .map((col, i) => String(item[col.key] ?? '').padEnd(widths[i]))
      .join('  ')
  );

  return [header, separator, ...rows].join('\n');
}

/**
 * Format a single entity as a key-value card.
 */
export function formatCard(entity: Record<string, unknown>, fields?: string[]): string {
  const keys = fields ?? Object.keys(entity);
  if (keys.length === 0) return '';

  const maxKeyLen = keys.reduce((max, k) => Math.max(max, k.length), 0);

  return keys
    .map((key) => {
      const val = entity[key];
      const display = val === null || val === undefined ? '' : String(val);
      return `${key.padEnd(maxKeyLen)}  ${display}`;
    })
    .join('\n');
}

/**
 * General output function. In JSON mode outputs parseable JSON,
 * in quiet mode outputs nothing, otherwise prints the value as a string.
 */
export function output(data: any, options: OutputOptions): void {
  if (options.quiet) return;
  if (options.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === 'string') {
    console.log(data);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

// ---------- Task formatters ----------

const TASK_COLUMNS: ColumnDef[] = [
  { key: 'key', header: 'KEY', width: 12 },
  { key: 'title', header: 'TITLE', width: 40 },
  { key: 'status', header: 'STATUS', width: 14 },
  { key: 'assignee_handle', header: 'ASSIGNEE', width: 16 },
];

export function formatTaskList(
  result: { items: any[]; next_cursor: string | null },
  options: OutputOptions,
): void {
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.quiet) {
    result.items.forEach((t) => console.log(t.key ?? t.id));
    return;
  }
  console.log(formatTable(result.items, TASK_COLUMNS));
  if (result.next_cursor) {
    console.log(`\n(more results — use --cursor ${result.next_cursor})`);
  }
}

export function formatTask(task: any, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }
  if (options.quiet) {
    console.log(task.key ?? task.id);
    return;
  }
  console.log(formatCard(task, ['key', 'title', 'status', 'type', 'priority', 'assignee_handle', 'project_id', 'created_at', 'updated_at']));
}

// ---------- Principal formatters ----------

const PRINCIPAL_COLUMNS: ColumnDef[] = [
  { key: 'handle', header: 'HANDLE', width: 20 },
  { key: 'display_name', header: 'NAME', width: 24 },
  { key: 'kind', header: 'KIND', width: 10 },
];

export function formatPrincipal(principal: any, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(principal, null, 2));
    return;
  }
  if (options.quiet) {
    console.log(principal.handle ?? principal.id);
    return;
  }
  console.log(formatCard(principal, ['handle', 'display_name', 'kind', 'created_at']));
}

export function formatPrincipalList(result: any, options: OutputOptions): void {
  const items = result.items ?? result;
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.quiet) {
    items.forEach((p: any) => console.log(p.handle ?? p.id));
    return;
  }
  console.log(formatTable(items, PRINCIPAL_COLUMNS));
}

// ---------- Project formatters ----------

const PROJECT_COLUMNS: ColumnDef[] = [
  { key: 'slug', header: 'SLUG', width: 16 },
  { key: 'name', header: 'NAME', width: 30 },
  { key: 'prefix', header: 'PREFIX', width: 8 },
];

export function formatProject(project: any, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(project, null, 2));
    return;
  }
  if (options.quiet) {
    console.log(project.slug ?? project.id);
    return;
  }
  console.log(formatCard(project, ['slug', 'name', 'prefix', 'description', 'created_at']));
}

export function formatProjectList(result: any, options: OutputOptions): void {
  const items = result.items ?? result;
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.quiet) {
    items.forEach((p: any) => console.log(p.slug ?? p.id));
    return;
  }
  console.log(formatTable(items, PROJECT_COLUMNS));
}

// ---------- RepoLink formatters ----------

export function formatRepoLink(link: { id: string; normalized_url: string; subpath: string; project_id: string }, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(link));
    return;
  }
  if (options.quiet) {
    console.log(link.id);
    return;
  }
  console.log(`linked: ${link.normalized_url}${link.subpath ? ` /${link.subpath}` : ''} → ${link.project_id}`);
}

export function formatRepoLinkList(links: Array<{ id: string; normalized_url: string; subpath: string; project_id: string }>, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(links));
    return;
  }
  for (const l of links) {
    console.log(`${l.normalized_url}\t${l.subpath || '/'}\t${l.project_id}`);
  }
}
