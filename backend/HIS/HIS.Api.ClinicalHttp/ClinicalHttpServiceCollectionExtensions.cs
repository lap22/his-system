using HIS.Api.Services.Clinical;
using Microsoft.Extensions.DependencyInjection;

namespace HIS.Api.ClinicalHttp;

// Registering these services does not add this assembly as an MVC application
// part. The active API does not reference or call this extension.
public static class ClinicalHttpServiceCollectionExtensions
{
    public static IServiceCollection AddDormantMedicalRecordsServices(
        this IServiceCollection services)
    {
        services.AddScoped<IClinicalWorkflowStore, EfClinicalWorkflowStore>();
        services.AddScoped<IClinicalClock, SystemClinicalClock>();
        services.AddScoped<IMedicalRecordApplicationService,
            MedicalRecordApplicationService>();
        return services;
    }
}

public sealed class SystemClinicalClock : IClinicalClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}
