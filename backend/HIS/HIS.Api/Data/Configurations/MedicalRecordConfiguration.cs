using HIS.Api.Entities;
using HIS.Api.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class MedicalRecordConfiguration : IEntityTypeConfiguration<MedicalRecord>
{
    public void Configure(EntityTypeBuilder<MedicalRecord> builder)
    {
        builder.ToTable("MedicalRecords", table =>
        {
            table.HasCheckConstraint("CK_MedicalRecords_Status", "[Status] IN (N'Draft', N'Finalized')");
            table.HasCheckConstraint(
                "CK_MedicalRecords_FinalizationLifecycle",
                "([Status] = N'Draft' AND [FinalizedAt] IS NULL AND [FinalizedByUserId] IS NULL) OR ([Status] = N'Finalized' AND [FinalizedAt] IS NOT NULL AND [FinalizedByUserId] IS NOT NULL AND [ChiefComplaint] IS NOT NULL AND LEN(LTRIM(RTRIM([ChiefComplaint]))) > 0 AND [Diagnosis] IS NOT NULL AND LEN(LTRIM(RTRIM([Diagnosis]))) > 0)");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.ChiefComplaint).HasMaxLength(2000);
        builder.Property(x => x.Symptoms).HasMaxLength(2000);
        builder.Property(x => x.Diagnosis).HasMaxLength(2000);
        builder.Property(x => x.Treatment).HasMaxLength(2000);
        builder.Property(x => x.DoctorNotes).HasMaxLength(4000);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32).HasDefaultValue(MedicalRecordStatus.Draft).IsRequired();
        builder.Property(x => x.RowVersion).IsRowVersion().IsConcurrencyToken();
        builder.HasOne(x => x.Appointment).WithOne(x => x.MedicalRecord)
            .HasForeignKey<MedicalRecord>(x => new { x.AppointmentId, x.PatientProfileId, x.DoctorId })
            .HasPrincipalKey<Appointment>(x => new { x.Id, x.PatientProfileId, x.DoctorId })
            .OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(x => x.PatientProfile).WithMany(x => x.MedicalRecords).HasForeignKey(x => x.PatientProfileId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(x => x.Doctor).WithMany(x => x.MedicalRecords).HasForeignKey(x => x.DoctorId).OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(x => x.FinalizedByUser).WithMany().HasForeignKey(x => x.FinalizedByUserId).OnDelete(DeleteBehavior.NoAction);
        builder.HasIndex(x => x.AppointmentId).IsUnique();
    }
}
