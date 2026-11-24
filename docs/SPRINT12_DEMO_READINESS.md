# HIS Sprint 12 Demo Readiness

Status: **preparation complete; live three-role demonstration is not yet approved**.

## 1. System architecture

The HIS is a three-tier local application:

- `backend/HIS/HIS.Api`: ASP.NET Core 10 API, JWT bearer authentication, EF Core 10 and SQL Server.
- `frontend/patient-web`: React 19 Patient Portal using Axios, TanStack Query, Material UI and Vite.
- `frontend/staff-web`: React 19 Doctor/Admin Portal using the same frontend stack plus SignalR.
- `/hubs/queue`: authenticated Patient/Doctor SignalR hub. Staff development proxy supports WebSocket upgrades.

The API is the authorization and workflow boundary. Frontend role guards, feature gates and mutation locks are additional UX protections, not substitutes for backend security.

## 2. Completed demonstrable features

### Patient

- Registration, login, protected routing and session refresh.
- Owned PatientProfile create, edit, select and guarded deletion.
- Department and Doctor discovery, schedule availability and hospital-local slots.
- Appointment booking with duplicate-submit and uncertain-outcome protection.
- My Appointments, details and permitted cancellation.
- Confirmed-appointment check-in and queue status display.
- Medical History page exists but its clinical API integration is disabled.

### Doctor

- Role-protected login, dashboard, schedule and assigned appointments.
- Pending appointment confirmation.
- Doctor-scoped queue with Waiting → Called → InService → Completed actions.
- SignalR queue invalidation plus polling/manual refresh fallback.
- Active Doctor/User enforcement and assigned-Doctor isolation.
- Clinical Examination workspace is present, but Save Draft and Finalize remain disabled.

### Admin

- Role-protected Department create, edit and activation management.
- Doctor create, edit and activation management.
- Recurring Doctor schedule create, edit, activate and deactivate.
- Schedule edits cannot invalidate existing future non-terminal appointments.
- Doctor deactivation revokes tracked Doctor queue connections and blocks later sensitive delivery.

## 3. Environment and startup

### Required configuration

The API requires these configuration sections, supplied by approved local configuration or environment variables:

- `ConnectionStrings:DefaultConnection`
- `Jwt:Issuer`, `Jwt:Audience`, `Jwt:Key`
- `Jwt:AccessTokenMinutes`, `Jwt:RefreshTokenDays`
- optional `SeedAdmin:Email` and `SeedAdmin:Password`

Never commit or print their values. Development startup resolves SQL Server and may insert the configured Admin if it does not exist. Starting the API therefore requires database approval. Disable startup seeding for a controlled demo process by setting both seed values empty before launch.

Patient Portal variables are documented in `frontend/patient-web/.env.example`; Staff Portal variables are in `frontend/staff-web/.env.example`. Both require:

- `VITE_API_BASE_URL=/api`
- `API_PROXY_TARGET=http://localhost:5216`
- the other portal URL
- `VITE_CLINICAL_API_ENABLED=false`

### Verified development commands

From the repository root, after database and process approval:

```powershell
$env:SeedAdmin__Email = ''
$env:SeedAdmin__Password = ''
dotnet run --project backend/HIS/HIS.Api/HIS.Api.csproj --launch-profile http
```

API URL: `http://localhost:5216`. Swagger is Development-only at `http://localhost:5216/swagger`.

In separate terminals:

```powershell
Set-Location frontend/patient-web
npm run dev
```

Patient Portal: `http://localhost:5173`.

```powershell
Set-Location frontend/staff-web
npm run dev
```

Staff Portal: `http://localhost:5174`.

The Vite proxies provide same-origin `/api`; Staff also proxies `/hubs/queue` with `ws: true`. The API itself has no browser CORS policy, so local development must use these proxies or a same-origin reverse proxy. Production hosting must proxy both paths and WebSocket upgrades.

The current running `HIS.Api.exe` started before the Sprint 12.2 and 12.2B source changes and must not be treated as the accepted demo build.

Current read-only runtime inventory during this review: API PID `13824` listens on `5216`, Patient Vite listens on `5173`, and Staff Vite listens on `5174`. These listeners were not restarted or mutated.

## 4. Cross-role demonstration script

Use synthetic accounts and profiles only. Choose the demonstration date immediately before setup using `Asia/Ho_Chi_Minh`; it must be today for check-in and must match the configured recurring weekday. Do not change the workstation clock or bypass API validation.

1. **Admin:** sign in, select or create a synthetic Department, create/select an active synthetic Doctor, and configure an active schedule that contains a future slot on the controlled date.
2. **Patient:** sign in, create/select an owned synthetic PatientProfile, browse the Department/Doctor, select the controlled date and available slot, book once, and open the returned appointment details.
3. **Doctor:** sign in, open assigned appointments, and confirm the Patient's Pending appointment.
4. **Patient:** on the hospital-local appointment date, open details and check in once. Record the real queue number/status returned by the API.
5. **Doctor:** open today's queue, observe the Patient, then perform Call, Start, and Complete exactly once each.
6. **All roles:** verify the final authoritative states through normal read pages.

Queue completion completes the queue workflow only. It does not finalize or fabricate a MedicalRecord. Clinical Save Draft/Finalize must remain unavailable.

If the presentation cannot run on the appointment date, demonstrate booking, confirmation and the queue UI separately using approved pre-arranged synthetic data; label the check-in/transition portion as simulated rather than bypassing date rules.

## 5. Evidence matrix

| Capability | Evidence | Classification |
|---|---|---|
| Patient booking and cancellation | Prior controlled real API/browser acceptance with cleanup | Live-verified historically; recheck current build before presentation |
| Dashboard populated appointment | Prior controlled real API/browser acceptance with cleanup | Live-verified historically |
| Doctor appointment/queue UI | Offline regressions and mocked browser | Mocked/offline only for current source |
| Admin Department/Doctor/Schedule UI | Offline regressions and mocked browser | Mocked/offline only |
| JWT active-user enforcement | 15 offline checks | Offline only |
| Doctor authorization | 10 offline checks | Offline only |
| Schedule integrity | 20 offline checks | Offline only; no SQL concurrency acceptance |
| SignalR Doctor revocation | 17 deterministic offline checks | No hosted WebSocket acceptance yet |
| Clinical Save Draft/Finalize | Feature-gated and dormant | Not demonstrable |
| Patient Medical History | Safe disabled/unavailable UI | No live clinical records |

Do not upgrade mocked/offline evidence to live acceptance in presentation material.

## 6. Hosted SignalR acceptance preparation

Use an isolated ASP.NET Core test host with fake account/Doctor state and no EF/SQL registration. Configure the real `QueueHub`, `DoctorQueueConnectionRegistry`, JSON protocol and a test authentication handler issuing only synthetic identities. Add test-only controls to trigger a synthetic `QueueUpdated` payload and atomically deactivate a Doctor through the registry.

Acceptance sequence:

1. Connect two clients for Doctor A and one for Doctor B.
2. Verify authorized Doctor-scoped delivery.
3. Deactivate Doctor A and await the revocation boundary.
4. Emit another event; assert neither Doctor A connection receives it while Doctor B remains functional.
5. Assert Doctor A reconnection fails and disconnected connections are cleaned up.
6. Capture logs and assert no JWT, patient name, PatientProfile ID or appointment payload is logged.

Use a real in-process SignalR transport if supported by the selected test server. If only mocked `IHubContext`/group behavior is exercised, retain the classification “offline”, not hosted transport acceptance.

## 7. Safe demo data

Required synthetic data:

- one active Admin account;
- one active Patient account with an owned PatientProfile;
- one active Doctor User, Doctor and Department;
- one active recurring DoctorSchedule matching the controlled date;
- no conflicting appointment in the selected slot.

Prepare exact identifiers, baseline counts and guarded cleanup separately before any live write. Never reuse real patient appointments for destructive demonstrations. Demo login credentials must be distributed out-of-band and never added to this document or source control.

## 8. Clinical limitations

- `VITE_CLINICAL_API_ENABLED` must remain `false` in both portals.
- Medical Records HTTP endpoints are dormant and are not part of the active API route set.
- Clinical migrations are not applied by this readiness phase.
- Queue Complete must not create or finalize clinical content.
- No real or fabricated clinical history should be shown.

## 9. Readiness gaps and priorities

### P0 before a live presentation

1. Gracefully replace the old running API with the freshly built Sprint 12 source under separate approval.
2. Verify the approved demo database identity, required schema/migrations and synthetic demo accounts/data.
3. Run a bounded smoke test for Swagger, both portals, login, and read-only role navigation.
4. Run the core cross-role workflow with controlled synthetic data or clearly label unexecuted portions.

### P1

- Hosted SignalR transport acceptance for multi-tab revocation.
- SQL-backed schedule-update versus booking concurrency acceptance.
- Production same-origin reverse-proxy and TLS validation.
- Code-split the large Patient Portal production bundle.

### P2

- Distributed SignalR revocation/backplane support for multi-instance deployment.
- Remove or align the currently unused Patient Portal `realtimeQueue.ts` hard-coded legacy hub default before enabling patient realtime consumption.
- Activate Medical Records only after separately approved database migration and live backend acceptance.

## 10. Test and acceptance checklist

```powershell
dotnet build backend/HIS/HIS.Api/HIS.Api.csproj --no-restore -p:UseAppHost=false -p:OutputPath=.tmp/sprint12-api/
dotnet build backend/HIS/HIS.Api.AuthenticationSecurityTests/HIS.Api.AuthenticationSecurityTests.csproj --no-restore -p:UseAppHost=false -p:OutputPath=.tmp/sprint12-auth/
dotnet .tmp/sprint12-auth/HIS.Api.AuthenticationSecurityTests.dll $PWD
dotnet build backend/HIS/HIS.Api.DoctorAuthorizationTests/HIS.Api.DoctorAuthorizationTests.csproj --no-restore -p:UseAppHost=false -p:OutputPath=.tmp/sprint12-doctor/
dotnet .tmp/sprint12-doctor/HIS.Api.DoctorAuthorizationTests.dll $PWD
dotnet build backend/HIS/HIS.Api.ScheduleIntegrityTests/HIS.Api.ScheduleIntegrityTests.csproj --no-restore -p:UseAppHost=false -p:OutputPath=.tmp/sprint12-schedule/
dotnet .tmp/sprint12-schedule/HIS.Api.ScheduleIntegrityTests.dll $PWD
dotnet build backend/HIS/HIS.Api.SignalRPrivacyTests/HIS.Api.SignalRPrivacyTests.csproj --no-restore -p:UseAppHost=false -p:OutputPath=.tmp/sprint12-signalr/
dotnet .tmp/sprint12-signalr/HIS.Api.SignalRPrivacyTests.dll $PWD

Set-Location frontend/patient-web
npm run typecheck
npm run lint
npm test
npm run build

Set-Location ../staff-web
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser:mocked
```

Before presentation, additionally confirm:

- clinical gates are false;
- the API build identity matches the reviewed source;
- Swagger and both portal URLs respond;
- only synthetic accounts/data are used;
- no unresolved mutation markers remain in browser storage;
- cleanup ownership and exact IDs are recorded.
