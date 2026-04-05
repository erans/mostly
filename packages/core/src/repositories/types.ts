export interface PaginatedResult<T> {
  items: T[];
  next_cursor: string | null;
}

export interface TaskListFilters {
  status?: string;
  assignee_id?: string;
  project_id?: string;
  claimed_by_id?: string;
}
