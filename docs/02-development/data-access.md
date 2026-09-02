# Data Access and Fetching Architecture

KUVENTORY uses **TanStack Query** (React Query) tightly integrated with the **Supabase JavaScript Client** for all data fetching and server state management.

## Query Boundaries and Cache
TanStack Query acts as the single source of truth for asynchronous data on the client. It handles caching, deduplication, and background refetching automatically.

### Query Keys
We use a strictly typed query key factory pattern to prevent typos and ensure predictable cache invalidation.

```typescript
export const queryKeys = {
  categories: {
    all: ['categories'] as const,
    detail: (id: string) => ['categories', id] as const,
  },
  inventory: {
    all: ['inventory'] as const,
    batches: (itemId: string) => ['inventory', 'batches', itemId] as const,
  },
  daily: {
    draft: ['daily', 'draft'] as const,
    byDate: (date: string) => ['daily', date] as const,
  }
};
```

### Invalidation Strategy
When a mutation occurs (e.g., updating a category), the relevant query keys are invalidated automatically in the mutation's `onSuccess` callback.

```typescript
const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => supabase.from('categories').update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all });
    }
  });
};
```

### Optimistic Updates
For highly interactive UI components (like typing in the AM/PM values of the Daily Inventory Draft), optimistic updates are crucial to prevent UI lag. The UI is updated instantly, and rolled back if the Supabase request fails.

### Realtime Synchronization
Supabase Realtime is **NOT** used universally. It is expensive in terms of active connections. It is only configured for:
- Live Notifications (e.g., Low Stock alerts pushed from the backend).
- If specifically required by the client for multi-user concurrent draft editing (if implemented).
For standard list views, background refetching on window focus is sufficient.

## Pagination and Filtering
For tables (like Reports or Audit Logs) that grow unbounded:
- Use server-side pagination with Supabase `.range(from, to)`.
- Use `useInfiniteQuery` or standard paginated `useQuery` depending on the UI (Infinite Scroll vs Pagination Controls).
- Filtering is pushed to the database (e.g., `.eq('category_id', id)`). No client-side array filtering for large datasets.

## Error Handling
Supabase errors are caught in the query functions and thrown so that React Query can capture them. They are then displayed to the user via a global Error Boundary or local Toast notifications. Raw database errors are intercepted and sanitized before display.
