using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using HIS.Api.Controllers;
using HIS.Api.Hubs;
using HIS.Api.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var repositoryRoot = Path.GetFullPath(args.Length == 1
    ? args[0]
    : Path.Combine(AppContext.BaseDirectory, "../../../../.."));
var authSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/Implementations/AuthService.cs"));
var programSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Program.cs"));
var appointmentSource = File.ReadAllText(Path.Combine(repositoryRoot,
    "backend/HIS/HIS.Api/Services/AppointmentService.cs"));
var passed = 0;

void Check(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}");
    passed++;
    Console.WriteLine($"PASS: {name}");
}

var userId = Guid.NewGuid();
ClaimsPrincipal Principal(string id, string role = "Patient") =>
    new(new ClaimsIdentity([
        new Claim(ClaimTypes.NameIdentifier, id),
        new Claim(ClaimTypes.Role, role)
    ], "offline"));

async Task ValidateStatus(bool? status, bool expected, string name)
{
    var validator = new ActiveUserTokenValidator(
        new FakeStatusReader(status));
    Check(await validator.IsAuthorizedAsync(
        Principal(userId.ToString()), CancellationToken.None) == expected, name);
}

await ValidateStatus(true, true, "Active User with valid identity is accepted");
await ValidateStatus(false, false, "Inactive User with previously issued identity is rejected");
await ValidateStatus(null, false, "Deleted User is rejected");
Check(!await new ActiveUserTokenValidator(new ThrowingStatusReader())
    .IsAuthorizedAsync(Principal(userId.ToString()), CancellationToken.None),
    "Database status-check failure fails closed");
Check(!await new ActiveUserTokenValidator(new FakeStatusReader(true))
    .IsAuthorizedAsync(Principal("invalid"), CancellationToken.None),
    "Malformed User identifier is rejected before lookup");

const string issuer = "offline-issuer";
const string audience = "offline-audience";
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
    "offline-test-key-with-at-least-thirty-two-bytes"));
var parameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidateAudience = true,
    ValidateLifetime = true,
    ValidateIssuerSigningKey = true,
    ValidIssuer = issuer,
    ValidAudience = audience,
    IssuerSigningKey = key,
    ClockSkew = TimeSpan.Zero
};
string Token(DateTime expires, SecurityKey signingKey) =>
    new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
        issuer, audience,
        [new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
         new Claim(ClaimTypes.Role, "Patient")],
        expires: expires,
        signingCredentials: new SigningCredentials(
            signingKey, SecurityAlgorithms.HmacSha256)));

var handler = new JwtSecurityTokenHandler();
_ = handler.ValidateToken(Token(DateTime.UtcNow.AddMinutes(5), key),
    parameters, out _);
Check(true, "JWT signature, issuer, audience and lifetime validation remains enabled");
try
{
    handler.ValidateToken(Token(DateTime.UtcNow.AddMinutes(-1), key),
        parameters, out _);
    throw new InvalidOperationException("FAIL: expired JWT accepted");
}
catch (SecurityTokenExpiredException)
{
    Check(true, "Expired JWT is rejected");
}
try
{
    var wrongKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(
        "different-offline-key-at-least-thirty-two-bytes"));
    handler.ValidateToken(Token(DateTime.UtcNow.AddMinutes(5), wrongKey),
        parameters, out _);
    throw new InvalidOperationException("FAIL: invalid signature accepted");
}
catch (SecurityTokenInvalidSignatureException)
{
    Check(true, "Invalid JWT signature is rejected");
}

var queueHubRoles = typeof(QueueHub).GetCustomAttribute<AuthorizeAttribute>()?.Roles;
Check(queueHubRoles == "Patient,Doctor" &&
      programSource.Contains("OnTokenValidated = async context", StringComparison.Ordinal) &&
      programSource.Contains("path.StartsWithSegments(\"/hubs/queue\")", StringComparison.Ordinal),
    "QueueHub handshake uses bearer authentication and active-User validation");
var adminCreate = typeof(DepartmentsController).GetMethod(
    nameof(DepartmentsController.Create))!;
Check(adminCreate.GetCustomAttribute<AuthorizeAttribute>()?.Roles == "Admin",
    "Incorrect role cannot use Admin Department mutation");
Check(appointmentSource.Contains(
        "x.PatientProfile.UserId == currentUserId", StringComparison.Ordinal),
    "PatientProfile ownership remains enforced");
Check(appointmentSource.Contains("x.UserId == currentUserId &&", StringComparison.Ordinal) &&
      appointmentSource.Contains("x.IsActive)", StringComparison.Ordinal),
    "Active Doctor profile and assigned-Doctor isolation remain enforced");
Check(authSource.Split("if (!user.IsActive)", StringSplitOptions.None).Length - 1 >= 2,
    "Login and refresh both reject deactivated Users");
Check(!programSource.Contains("JWT validated successfully", StringComparison.Ordinal) &&
      !programSource.Contains("context.Exception.Message", StringComparison.Ordinal),
    "Authentication pipeline does not log tokens or provider exception details");
Check(!Directory.GetFiles(Path.Combine(repositoryRoot,
        "backend/HIS/HIS.Api/Controllers"), "*MedicalRecord*Controller.cs").Any(),
    "Medical Records HTTP endpoints remain dormant");

Console.WriteLine($"Authentication security checks: {passed}/{passed} PASS");

sealed class FakeStatusReader(bool? status) : IUserAccountStatusReader
{
    public Task<bool?> GetIsActiveAsync(Guid userId,
        CancellationToken cancellationToken) => Task.FromResult(status);
}

sealed class ThrowingStatusReader : IUserAccountStatusReader
{
    public Task<bool?> GetIsActiveAsync(Guid userId,
        CancellationToken cancellationToken) =>
        throw new InvalidOperationException("Synthetic provider failure");
}
