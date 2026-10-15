# Phase 4: Doctors and Departments

Phase 4.2 supersedes the recurring schedule UI below with date-based availability
and slot selection. See `phase-4.2-appointment-slots.md` for the current details UI.

Patient Portal route: `/doctors`, inside the existing Patient-only `AuthBoundary`.
The feature reuses the authenticated Axios client and TanStack Query. No backend,
database, authentication contract or dependency changes are required.

## Verified backend contracts

All endpoints below require authentication and permit Patient accounts.
Controller write operations are Admin-only and are not used by this feature.

| Endpoint | Response | Usage |
| --- | --- | --- |
| `GET /api/departments` | `DepartmentResponse[]` | Filter `isActive` in the frontend; no active-status query parameter is supported. |
| `GET /api/departments/{id}` | `DepartmentResponse` | Supported by backend; not needed for the directory. |
| `GET /api/doctors?isActive=true&departmentId={id}` | `DoctorResponse[]` | Omit `departmentId` for All Departments. Search the fetched list by name or specialization. |
| `GET /api/doctors/{id}` | `DoctorResponse` | Fetch selected doctor details; an inactive detail is not displayed. |
| `GET /api/doctor-schedules?doctorId={id}&isActive=true` | `DoctorScheduleResponse[]` | Recurring working days, start/end times and slot duration. |
| `GET /api/doctor-schedules/{id}` | `DoctorScheduleResponse` | Supported by backend; not needed for the directory. |

Responses are direct JSON arrays or objects, read from Axios `response.data`.
Doctor fields match `DoctorResponse`: `id`, `userId`, `email`, `departmentId`,
`departmentName`, `fullName`, `phone`, `specialization`, `licenseNumber`,
`yearsOfExperience`, `biography`, `avatarUrl`, `isActive`, `createdAt`, `updatedAt`.
The UI displays only the requested discovery fields, not account identifiers.

Department fields: `id`, `name`, `description`, `isActive`, `createdAt`, `updatedAt`.
Schedule fields: `id`, `doctorId`, `doctorName`, `dayOfWeek`, `startTime`, `endTime`,
`slotDurationMinutes`, `maxPatients`, `isActive`.

The backend serializes `DayOfWeek` as an enum name, `TimeOnly` as an ISO time, and
SQL-loaded `DateTime` values without a timezone suffix. The Zod schemas accept
these formats, including fractional seconds and UTC/offset timestamps.

## Components and behavior

- `DoctorCard` and `DoctorAvatar`: real directory fields, avatar URL and initials fallback.
- `DoctorSearch`: case-insensitive name/specialization search with Vietnamese accent normalization.
- `DepartmentFilter`: active departments and All Departments, including departments with no doctors.
- `DoctorDetails`: fresh detail query, biography, experience and inactive/missing doctor handling.
- `DoctorScheduleSection`: recurring schedules only; no appointment availability or booking.
- `DirectoryFeedback`: resource-specific errors and retry controls.

Doctor, department, detail and schedule queries use separate cache keys and
Axios cancellation signals. Schedule requests begin only for an active doctor
whose detail dialog has loaded. Empty and failed responses have explicit states.

## Verification

```powershell
node tests/doctorDirectory.test.cjs
npm run lint
npm run build
```

The tests use isolated test fixtures and an Axios test adapter, never production
fallback data. They cover name/specialization search, inactive exclusion, empty
results, backend request parameters, response formats and API error messages.

Executed: four tests passed; lint and production build passed, including
TypeScript. Vite reports the existing large-chunk warning. Live unauthenticated
requests to departments, doctors and doctor schedules returned 401.

Not executed: successful Patient login, authenticated discovery reads, browser
interaction/viewport checks and authenticated Patient Profiles regression checks.
An existing Patient test account and browser session were unavailable. Existing
authentication and Patient Profiles source files were not changed.

## Contract limits

The API provides no name/specialization search or pagination, so search uses the
fetched department's active doctors. Departments expose no server-side active
filter. Recurring schedules do not establish available appointment slots.
The backend has a separate available-slots endpoint, which Phase 4 does not call.
There is no missing Patient schedule contract.
