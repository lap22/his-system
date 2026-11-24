using System.Data;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace HIS.Api.Services;

public static class AppointmentScheduleLock
{
    public static Task AcquireSharedAsync(DatabaseFacade database, Guid doctorId) =>
        AcquireAsync(database, doctorId, "Shared");

    public static Task AcquireExclusiveAsync(DatabaseFacade database, Guid doctorId) =>
        AcquireAsync(database, doctorId, "Exclusive");

    private static async Task AcquireAsync(
        DatabaseFacade database,
        Guid doctorId,
        string mode)
    {
        var lockResult = new SqlParameter("@lockResult", SqlDbType.Int)
        {
            Direction = ParameterDirection.Output
        };
        var resource = new SqlParameter("@resource", SqlDbType.NVarChar, 255)
        {
            Value = $"appointment-schedule:{doctorId:N}"
        };
        var lockMode = new SqlParameter("@mode", SqlDbType.NVarChar, 32)
        {
            Value = mode
        };

        await database.ExecuteSqlRawAsync(
            """
            EXEC @lockResult = sp_getapplock
                @Resource = @resource,
                @LockMode = @mode,
                @LockOwner = 'Transaction',
                @LockTimeout = 10000;
            """,
            lockResult, resource, lockMode);

        if ((int)lockResult.Value < 0)
        {
            throw new InvalidOperationException(
                "Could not acquire the appointment schedule lock. Please try again.");
        }
    }
}
