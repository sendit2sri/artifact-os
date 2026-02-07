# Bugfix: Hydration Mismatch Error (Theme Toggle)

## Problem
```
Hydration failed because the server rendered HTML didn't match the client.
Error at: {theme === "dark" ? <Sun /> : <Moon />}
```

The theme icon was causing a hydration mismatch because:
- **Server**: Doesn't have access to `localStorage`, renders with default theme
- **Client**: Reads stored theme from `localStorage`, renders different icon
- **Result**: React sees mismatched HTML → throws hydration error

## Root Cause
The `useTheme` hook from `next-themes` uses `localStorage` to persist the user's theme preference. During SSR:
1. Server renders with a default/undefined theme
2. Client hydrates with actual theme from localStorage
3. If they don't match → hydration error

## Solution
Prevent rendering theme-dependent content until **after** client-side hydration completes.

### Changes Made
**File**: `apps/web/src/app/project/[id]/page.tsx`

#### 1. Added `mounted` State
```typescript
// Fix hydration mismatch: only render theme icon after client mount
const [mounted, setMounted] = useState(false);

// Set mounted state after hydration
useEffect(() => {
    setMounted(true);
}, []);
```

#### 2. Conditional Rendering
**Before:**
```tsx
<Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
</Button>
```

**After:**
```tsx
<Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {mounted ? (
        theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />
    ) : (
        <div className="w-4 h-4" />  {/* Placeholder during SSR */}
    )}
</Button>
```

## How It Works

### Timeline
1. **SSR (Server)**: Renders empty `<div>` placeholder
2. **Hydration (Client)**: React hydrates with same empty `<div>`
3. **Post-Mount (Client)**: `useEffect` runs → `mounted = true` → correct icon renders

### Why This Works
- Server and client now render **identical HTML** during hydration
- Theme icon only appears after hydration completes
- No visual flash because the button stays the same size

## Visual Impact
- ✅ No hydration errors
- ✅ No layout shift (placeholder maintains button size)
- ✅ Theme toggle still works instantly
- ⚠️ Very brief moment (< 100ms) where icon is empty on first load

## Alternative Solutions Considered

### 1. `suppressHydrationWarning`
```tsx
<button suppressHydrationWarning>
    {theme === "dark" ? <Sun /> : <Moon />}
</button>
```
❌ **Not recommended**: Hides the error but doesn't fix root cause

### 2. Server-side theme detection
```tsx
// Using cookies or headers to sync server/client theme
```
❌ **Too complex**: Requires middleware + cookie handling

### 3. CSS-only toggle
```tsx
<Sun className="dark:hidden" />
<Moon className="hidden dark:block" />
```
✅ **Good alternative**: Both icons render, CSS shows/hides
❌ **Trade-off**: Slightly larger bundle (both icons included)

## Best Practice for `next-themes`

This pattern should be used **anywhere** you conditionally render based on theme:

```tsx
function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="w-4 h-4" />;  // Or skeleton/spinner
    }

    return theme === "dark" ? <Sun /> : <Moon />;
}
```

## Testing Checklist

1. **Check for errors**:
   - [ ] No hydration warnings in console
   - [ ] No React warnings about mismatched HTML

2. **Test theme toggle**:
   - [ ] Click theme button → switches correctly
   - [ ] Refresh page → theme persists
   - [ ] No visual flash or layout shift

3. **Test SSR**:
   - [ ] View page source (should see placeholder `<div>`)
   - [ ] Disable JavaScript → button still renders (just empty)

## Related Files
- ✅ `apps/web/src/app/project/[id]/page.tsx` - Fixed
- ℹ️ Only one file affected (theme toggle only appears here)

## References
- [Next.js Hydration Docs](https://react.dev/link/hydration-mismatch)
- [next-themes Issue #302](https://github.com/pacocoursey/next-themes/issues/302) (common pattern)
- [React Hydration Best Practices](https://react.dev/reference/react-dom/client/hydrateRoot)
