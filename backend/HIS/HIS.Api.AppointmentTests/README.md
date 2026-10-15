# Appointment Availability Integration Checks

Run from the repository root against the configured development SQL Server:

```powershell
dotnet build backend/HIS/HIS.Api.AppointmentTests/HIS.Api.AppointmentTests.csproj -p:UseAppHost=false -p:OutputPath=bin/AppointmentTests/
dotnet backend/HIS/HIS.Api.AppointmentTests/bin/AppointmentTests/HIS.Api.AppointmentTests.dll
```

No additional packages or migrations are required. The isolated output directory
avoids executable locks from a running API. The tests use real SQL Server,
`AppointmentService` and `QueueService`, with independent contexts for concurrent
requests. They create disposable records and remove only those IDs in `finally`.
Committed fixtures are necessary to exercise application locks across connections.
Run against the development database, not production.

The concurrency fixture includes two overlapping schedule grids to exercise
different-start bookings, as might occur with legacy or changed schedules. The
first booking pauses before insertion while holding its transaction-owned lock;
the second booking and availability read must wait. Exactly one booking persists.
SignalR delivery is replaced by a recording notifier for the queue-flow test.

The 40 checks cover future availability and booking, hospital-local time,
`MaxPatients`, profile ownership, Completed exact/partial overlaps, touching
boundaries, Cancelled history/rebooking, all other non-cancelled statuses, past
dates/times, inactive schedules/doctors/accounts/departments, concurrency, the
CheckIn/Call/Start/Complete flow, retained history and response serialization.

These are SQL/service integration checks, not HTTP/JWT or browser tests.

## Availability Response

The authenticated route remains:

`GET /api/doctors/{doctorId}/available-slots?date=YYYY-MM-DD`

It now returns all generated candidate slots, including unavailable candidates:

```json
[
  {
    "startTime": "09:00:00",
    "endTime": "09:30:00",
    "isAvailable": false,
    "reason": "Completed"
  }
]
```

`reason` is the string serialization of `SlotAvailabilityReason`: `Available`,
`Completed`, `Full`, `Past` or `Inactive`. `isAvailable` is derived from the reason.
An inactive doctor/account/department/schedule takes precedence; otherwise a
Completed overlap takes precedence over Past, then Full. No appointment or
patient identifiers are disclosed. Identical inactive/active schedule candidates
are merged with the active candidate taking precedence. A doctor with no matching
schedule returns an empty array; a missing doctor still returns 404.

Past dates and inactive doctors now return unavailable candidates instead of
throwing their previous validation error. Clients must check `isAvailable` rather
than assuming every returned slot can be booked. The route, time properties and
appointment creation request are unchanged. No frontend runtime consumers of this
availability API exist in the current checkout, and no frontend files changed.

## Preserved Rules

Each schedule generates at most `MaxPatients` complete intervals, maintaining the
existing schedule capacity interpretation. One non-cancelled appointment blocks
an overlapping interval, including NoShow; Cancelled appointments do not block.
Intervals touching at a boundary do not overlap. Creation still requires Patient
role, profile ownership, an active doctor/account/department and an active schedule.
The server derives EndTime from the schedule.

Both availability and creation acquire a transaction-owned SQL Server application
lock keyed by doctor/date (Shared for reads, Exclusive for booking). They capture
one `HospitalClock.LocalNow` snapshot after acquisition. All new bookings through
the service serialize their conflict check and insertion. The existing unique
index remains the final guard for identical start times; no schema changes occur.
The lock does not reserve slots returned to a client: creation always revalidates.
