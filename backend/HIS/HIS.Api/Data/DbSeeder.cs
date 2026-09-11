using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(
        AppDbContext dbContext,
        IConfiguration configuration)
    {
        var adminEmail =
            configuration["SeedAdmin:Email"];

        var adminPassword =
            configuration["SeedAdmin:Password"];

        if (string.IsNullOrWhiteSpace(adminEmail) ||
            string.IsNullOrWhiteSpace(adminPassword))
        {
            return;
        }

        adminEmail = adminEmail
            .Trim()
            .ToLowerInvariant();

        var adminExists =
            await dbContext.Users
                .AnyAsync(x => x.Email == adminEmail);

        if (adminExists)
        {
            return;
        }

        var admin = new User
        {
            Email = adminEmail,

            PasswordHash =
                BCrypt.Net.BCrypt.HashPassword(
                    adminPassword
                ),

            Role = UserRole.Admin,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        dbContext.Users.Add(admin);

        await dbContext.SaveChangesAsync();
    }
}