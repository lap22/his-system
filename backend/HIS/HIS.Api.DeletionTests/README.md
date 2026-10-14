# Patient Profile Deletion Checks

Run from the repository root against the configured local development SQL Server:

```powershell
dotnet build backend/HIS/HIS.Api.DeletionTests/HIS.Api.DeletionTests.csproj -p:UseAppHost=false -p:OutputPath=bin/DeletionTests/
dotnet backend/HIS/HIS.Api.DeletionTests/bin/DeletionTests/HIS.Api.DeletionTests.dll
```

The console checks use the real `AppDbContext`, deletion service, controller and
exception middleware. They create disposable records inside a transaction and
roll back in `finally`. They do not run migrations or retain test data. The
separate build output avoids locks from a running development API.

Coverage:

- Successful deletion without appointments (204).
- Appointment history produces the exact 409 business response.
- Blocked profiles and all related appointment fields remain unchanged.
- Deleting the default profile reassigns the oldest remaining profile.
- Another user's profile returns the existing 404 response.
- An interceptor inserts an appointment after the pre-check and before SQL
  deletion, verifying that a real FK violation becomes a safe 409 response.

These are database/controller/middleware integration checks. They do not issue
HTTP requests or exercise JWT authentication or the browser UI.
