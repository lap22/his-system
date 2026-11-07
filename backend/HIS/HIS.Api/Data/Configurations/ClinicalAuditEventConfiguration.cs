using HIS.Api.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace HIS.Api.Data.Configurations;

public class ClinicalAuditEventConfiguration : IEntityTypeConfiguration<ClinicalAuditEvent>
{
    public void Configure(EntityTypeBuilder<ClinicalAuditEvent> builder)
    {
        builder.ToTable("ClinicalAuditEvents", table =>
            table.HasCheckConstraint("CK_ClinicalAuditEvents_RequiredText",
                "LEN(LTRIM(RTRIM([Action]))) > 0 AND LEN(LTRIM(RTRIM([CorrelationId]))) > 0"));
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Action).HasMaxLength(50).IsRequired();
        builder.Property(x => x.OccurredAt).HasColumnType("datetime2(7)").IsRequired();
        builder.Property(x => x.CorrelationId).HasMaxLength(128).IsRequired();
        builder.Property(x => x.PreviousRecordVersion).HasColumnType("binary(8)").HasMaxLength(8).IsFixedLength();
        builder.Property(x => x.NewRecordVersion).HasColumnType("binary(8)").HasMaxLength(8).IsFixedLength().IsRequired();

        builder.HasOne(x => x.MedicalRecord)
            .WithMany(x => x.AuditEvents)
            .HasForeignKey(x => x.MedicalRecordId)
            .OnDelete(DeleteBehavior.NoAction);
        builder.HasOne(x => x.ActorUser)
            .WithMany()
            .HasForeignKey(x => x.ActorUserId)
            .OnDelete(DeleteBehavior.NoAction);

        builder.HasIndex(x => new { x.MedicalRecordId, x.OccurredAt, x.Id });
        builder.HasIndex(x => x.ActorUserId);
    }
}
