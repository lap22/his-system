using System.Security.Claims;
using HIS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Security;

public interface IUserAccountStatusReader
{
    Task<bool?> GetIsActiveAsync(Guid userId, CancellationToken cancellationToken);
}

public sealed class EfUserAccountStatusReader(AppDbContext dbContext)
    : IUserAccountStatusReader
{
    public Task<bool?> GetIsActiveAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        dbContext.Users
            .AsNoTracking()
            .Where(user => user.Id == userId)
            .Select(user => (bool?)user.IsActive)
            .SingleOrDefaultAsync(cancellationToken);
}

public sealed class ActiveUserTokenValidator(
    IUserAccountStatusReader statusReader)
{
    public async Task<bool> IsAuthorizedAsync(
        ClaimsPrincipal? principal,
        CancellationToken cancellationToken)
    {
        var value = principal?.FindFirstValue(
            ClaimTypes.NameIdentifier);

        if (!Guid.TryParse(value, out var userId))
        {
            return false;
        }

        try
        {
            return await statusReader.GetIsActiveAsync(
                userId,
                cancellationToken) == true;
        }
        catch
        {
            // Authentication must fail closed when account status cannot
            // be established. Provider details are intentionally not logged.
            return false;
        }
    }
}
