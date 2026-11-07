using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class AppointmentConfiguration
    : IEntityTypeConfiguration<Appointment>
{
    public void Configure(EntityTypeBuilder<Appointment> builder)
    {
        builder.ToTable("Appointments");

        builder.HasKey(x => x.Id);

        // Clinical records must identify the appointment's actual patient and doctor.
        builder.HasAlternateKey(x => new { x.Id, x.PatientProfileId, x.DoctorId })
            .HasName("AK_Appointments_Id_PatientProfileId_DoctorId")
            .IsClustered(false);

        builder.Property(x => x.AppointmentDate)
            .IsRequired();

        builder.Property(x => x.StartTime)
            .IsRequired();

        builder.Property(x => x.EndTime)
            .IsRequired();

        builder.Property(x => x.Symptoms)
            .HasMaxLength(2000);

        builder.Property(x => x.Status)
            .HasConversion<string>()
            .HasMaxLength(50)
            // Guard every tracked transition against a status changed by another request.
            .IsConcurrencyToken()
            .IsRequired();

        builder.Property(x => x.CancellationReason)
            .HasMaxLength(1000);

        builder.Property(x => x.CreatedAt)
            .IsRequired();

        builder.HasOne(x => x.PatientProfile)
            .WithMany(x => x.Appointments)
            .HasForeignKey(x => x.PatientProfileId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasOne(x => x.Doctor)
            .WithMany(x => x.Appointments)
            .HasForeignKey(x => x.DoctorId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => new
        {
            x.DoctorId,
            x.AppointmentDate,
            x.StartTime
        })
         .IsUnique()
         .HasFilter("[Status] <> 'Cancelled'");

        builder.HasIndex(x => new
        {
            x.PatientProfileId,
            x.AppointmentDate
        });
    }
}
