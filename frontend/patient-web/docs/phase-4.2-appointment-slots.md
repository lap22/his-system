# Phase 4.2: Patient Appointment Slot Selector

Doctor details now show Available Appointments instead of recurring schedules.
This phase displays availability and holds a local selection only. It does not
create appointments, submit forms, or modify the backend or database.

## Real API Contract

`GET /api/doctors/{doctorId}/available-slots?date=YYYY-MM-DD`

The authenticated Axios client reads `response.data` as a direct array. Each
candidate contains `startTime`, `endTime`, `isAvailable` and `reason`. ISO time
strings retain their original precision. Reasons are Available, Completed, Full,
Past and Inactive. Selection depends on `isAvailable`, not on a guessed reason.
Old responses missing availability metadata fail validation rather than making
unavailable slots selectable. The running backend must include the updated DTO.

## Components and Selection

- `AvailableAppointments`: hospital-local date input and slot query states.
- `AppointmentSlotButton`: native disabled MUI buttons, explicit reason labels,
  selected state, gray unavailable background, disabled hover and pointer events.
- `useAvailableAppointments`: separate doctor/date Query cache entries, cancellation,
  30-second foreground polling, focus refresh and manual refresh.
- `appointmentAvailability`: typed response schema and selection/date utilities.

The date input uses Asia/Ho_Chi_Minh for its minimum calendar date and updates
across midnight. Invalid or past dates do not mount the slot query. Doctor/date
keys reset local state. A failed refresh, removed interval or unavailable interval
clears the stored selection; it cannot return automatically on a later response.
Slot interaction is also disabled while refreshing. No appointment POST exists.

## Checks

```powershell
node tests/doctorDirectory.test.cjs
npm run lint
npm run build
```

Eight automated checks cover directory search, API request paths/date parameters,
response validation, errors, UTC+7 date boundaries, availability-based selection,
rendered disabled buttons/hover CSS and selected/refresh-disabled rendering.
They use isolated test fixtures and server-rendered components, not real browser
hover/click interaction. The application has no mock or fallback availability.

Read-only SQL inspection confirmed the named Patient test account is active and
found historical Completed and CheckedIn appointments. All discovered scenarios
were on past dates. No credentials file was found in the repository, and no
database records were changed. Authenticated HTTP and manual browser tests remain
pending credentials. Future Completed and Full UI scenarios require suitable
existing records or separately approved disposable fixtures.

Proposed isolated fixtures: a separate active test doctor, active schedule on a
future hospital-local date, one Completed appointment, one Pending appointment
(Full), and one free interval. Creation and cleanup require separate approval;
no fixtures were created during this frontend phase.
