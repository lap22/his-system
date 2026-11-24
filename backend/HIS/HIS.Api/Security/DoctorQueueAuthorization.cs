using HIS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Security;

public interface IDoctorQueueAuthorizationReader
{
    Task<bool> IsAuthorizedAsync(Guid userId, CancellationToken cancellationToken);
}

public sealed class EfDoctorQueueAuthorizationReader(AppDbContext dbContext)
    : IDoctorQueueAuthorizationReader
{
    public async Task<bool> IsAuthorizedAsync(
        Guid userId,
        CancellationToken cancellationToken)
    {
        try
        {
            return await dbContext.Doctors
                .AsNoTracking()
                .AnyAsync(doctor =>
                    doctor.UserId == userId &&
                    doctor.IsActive &&
                    doctor.User.IsActive,
                    cancellationToken);
        }
        catch
        {
            return false;
        }
    }
}
