using HIS.Api.Data;
using HIS.Api.Middleware;
using HIS.Api.Services.Implementations;
using HIS.Api.Services.Interfaces;
using HIS.Api.Settings;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.Text;


var builder = WebApplication.CreateBuilder(args);

// ============================================================
// 1. Controllers
// ============================================================

builder.Services.AddControllers();


// ============================================================
// 2. Swaggerdo
// ============================================================

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition(
        "Bearer",
        new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Name = "Authorization",
            Description = "Enter JWT access token"
        }
    );

    options.AddSecurityRequirement(document =>
        new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecuritySchemeReference(
                    "Bearer",
                    document
                ),
                new List<string>()
            }
        }
    );
});

// ============================================================
// 3. Database - SQL Server + Entity Framework Core
// ============================================================

builder.Services.AddDbContext<AppDbContext>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection")
    );
});


// ============================================================
// 4. JWT Settings
// ============================================================

builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection("Jwt")
);

var jwtSettings = builder.Configuration
    .GetSection("Jwt")
    .Get<JwtSettings>()
    ?? throw new InvalidOperationException(
        "JWT settings are missing."
    );

if (string.IsNullOrWhiteSpace(jwtSettings.Key))
{
    throw new InvalidOperationException(
        "JWT Key is missing."
    );
}


// ============================================================
// 5. Dependency Injection - Services
// ============================================================

builder.Services.AddScoped<ITokenService, TokenService>();

builder.Services.AddScoped<IAuthService, AuthService>();


// ============================================================
// 6. Authentication - JWT Bearer
// ============================================================

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme =
            JwtBearerDefaults.AuthenticationScheme;

        options.DefaultChallengeScheme =
            JwtBearerDefaults.AuthenticationScheme;

        options.DefaultScheme =
            JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters =
            new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,

                ValidIssuer = jwtSettings.Issuer,
                ValidAudience = jwtSettings.Audience,

                IssuerSigningKey =
                    new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtSettings.Key)
                    ),

                ClockSkew = TimeSpan.Zero
            };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine(
                    $"JWT Authentication Failed: {context.Exception.Message}"
                );

                return Task.CompletedTask;
            },

            OnChallenge = context =>
            {
                Console.WriteLine(
                    $"JWT Challenge: {context.Error} - {context.ErrorDescription}"
                );

                return Task.CompletedTask;
            },

            OnTokenValidated = context =>
            {
                Console.WriteLine(
                    "JWT validated successfully."
                );

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();


// ============================================================
// 7. Authorization
// ============================================================

builder.Services.AddAuthorization();


// ============================================================
// Build Application
// ============================================================

var app = builder.Build();



// ============================================================
// 8. Swagger Middleware
// ============================================================

if (app.Environment.IsDevelopment())
{
    using var scope =
    app.Services.CreateScope();

    var dbContext =
        scope.ServiceProvider
            .GetRequiredService<AppDbContext>();

    await DbSeeder.SeedAsync(
        dbContext,
        app.Configuration
    );
    app.UseSwagger();

    app.UseSwaggerUI();
}
app.UseMiddleware<ExceptionHandlingMiddleware>();

// ============================================================
// 9. HTTP Pipeline
// ============================================================

app.UseHttpsRedirection();


// IMPORTANT:
// Authentication must come before Authorization.

app.UseAuthentication();

app.UseAuthorization();


// ============================================================
// 10. Map Controllers
// ============================================================

app.MapControllers();


// ============================================================
// Run Application
// ============================================================

app.Run();