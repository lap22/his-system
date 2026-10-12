using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;


namespace HIS.Api.Data.Configurations;

public class QueueEntryConfiguration
    : IEntityTypeConfiguration<QueueEntry>
{
    public void Configure(EntityTypeBuilder<QueueEntry> builder)
    {
        builder.ToTable("QueueEntries");

        builder.HasKey(x => x.Id);
        builder.Property(x => x.RowVersion)
        .IsRowVersion();

        builder.Property(x => x.QueueNumber)
            .IsRequired();

        builder.Property(x => x.Status)
            .HasConversion<string>()
            .HasMaxLength(30)
            .IsRequired();

        builder.Property(x => x.CheckedInAt)
            .IsRequired();

        builder.HasOne(x => x.Appointment)
            .WithOne(x => x.QueueEntry)
            .HasForeignKey<QueueEntry>(x => x.AppointmentId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => x.AppointmentId)
            .IsUnique();

        builder.HasIndex(x => x.Status);
        builder.Property(x => x.DoctorId)
    .IsRequired();

        builder.Property(x => x.AppointmentDate)
            .HasColumnType("date")
            .IsRequired();

        builder.HasIndex(x => new
        {
            x.DoctorId,
            x.AppointmentDate,
            x.QueueNumber
        })
        .IsUnique();

    }
}