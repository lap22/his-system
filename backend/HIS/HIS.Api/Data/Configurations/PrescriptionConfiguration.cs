using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class PrescriptionConfiguration : IEntityTypeConfiguration<Prescription>
{
    public void Configure(EntityTypeBuilder<Prescription> builder)
    {
        builder.ToTable("Prescriptions");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Notes).HasMaxLength(2000);
        builder.Property(x => x.UpdatedAt).HasColumnType("datetime2(7)");

        builder.HasOne(x => x.MedicalRecord)
            .WithOne(x => x.Prescription)
            .HasForeignKey<Prescription>(x => x.MedicalRecordId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => x.MedicalRecordId).IsUnique();
    }
}
