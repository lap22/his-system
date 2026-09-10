using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;

namespace HIS.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(
        DbContextOptions<AppDbContext> options)
        : base(options)
    {

    }
    public DbSet<User> Users => Set<User>();
    public DbSet<PatientProfile> PatientProfiles => Set<PatientProfile>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<Doctor> Doctors => Set<Doctor>();
    public DbSet<DoctorSchedule> DoctorSchedules => Set<DoctorSchedule>();
    public DbSet<Appointment> Appointments => Set<Appointment>();
    public DbSet<QueueEntry> QueueEntries => Set<QueueEntry>();
    public DbSet<MedicalRecord> MedicalRecords => Set<MedicalRecord>();
    public DbSet<Prescription> Prescriptions => Set<Prescription>();
    public DbSet<PrescriptionItem> PrescriptionItems => Set<PrescriptionItem>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ApplyConfigurationsFromAssembly(
            typeof(AppDbContext).Assembly
        );
    }
}