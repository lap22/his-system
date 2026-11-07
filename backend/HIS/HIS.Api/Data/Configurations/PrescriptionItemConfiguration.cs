using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class PrescriptionItemConfiguration : IEntityTypeConfiguration<PrescriptionItem>
{
    public void Configure(EntityTypeBuilder<PrescriptionItem> builder)
    {
        builder.ToTable("PrescriptionItems", table =>
        {
            table.HasCheckConstraint("CK_PrescriptionItems_RequiredText",
                "LEN(LTRIM(RTRIM([MedicineName]))) > 0 AND LEN(LTRIM(RTRIM([Dosage]))) > 0 AND " +
                "LEN(LTRIM(RTRIM([Frequency]))) > 0 AND LEN(LTRIM(RTRIM([Duration]))) > 0 AND " +
                "LEN(LTRIM(RTRIM([QuantityUnit]))) > 0");
            table.HasCheckConstraint("CK_PrescriptionItems_Quantity_Positive", "[Quantity] > 0");
            table.HasCheckConstraint("CK_PrescriptionItems_Position_Positive", "[Position] > 0");
        });
        builder.HasKey(x => x.Id);
        builder.Property(x => x.MedicineName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Dosage).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Frequency).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Duration).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Instructions).HasMaxLength(1000);
        builder.Property(x => x.Quantity).HasPrecision(10, 2).IsRequired();
        builder.Property(x => x.QuantityUnit).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Position).IsRequired();

        builder.HasOne(x => x.Prescription)
            .WithMany(x => x.Items)
            .HasForeignKey(x => x.PrescriptionId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => new { x.PrescriptionId, x.Position }).IsUnique();
    }
}
