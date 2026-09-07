using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class MedicalRecordConfiguration
    : IEntityTypeConfiguration<MedicalRecord>
{
    public void Configure(EntityTypeBuilder<MedicalRecord> builder)
    {
        builder.ToTable("MedicalRecords");

        builder.HasKey(x => x.Id);

        builder.Property(x => x.ChiefComplaint)
            .HasMaxLength(2000)
            .IsRequired();

        builder.Property(x => x.Symptoms)
            .HasMaxLength(2000);

        builder.Property(x => x.Diagnosis)
            .HasMaxLength(2000)
            .IsRequired();

        builder.Property(x => x.Treatment)
            .HasMaxLength(2000);

        builder.Property(x => x.DoctorNotes)
            .HasMaxLength(4000);

        builder.HasOne(x => x.Appointment)
            .WithOne(x => x.MedicalRecord)
            .HasForeignKey<MedicalRecord>(x => x.AppointmentId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(x => x.PatientProfile)
            .WithMany(x => x.MedicalRecords)
            .HasForeignKey(x => x.PatientProfileId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(x => x.Doctor)
            .WithMany(x => x.MedicalRecords)
            .HasForeignKey(x => x.DoctorId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => x.AppointmentId)
            .IsUnique();
    }
}