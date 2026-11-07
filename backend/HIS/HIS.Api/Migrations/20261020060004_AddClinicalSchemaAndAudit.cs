using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HIS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddClinicalSchemaAndAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // This migration deliberately has no clinical backfill. Hold the empty
            // tables until commit so another writer cannot pass the gate concurrently.
            migrationBuilder.Sql("""
                IF @@TRANCOUNT = 0
                    THROW 51060, 'Clinical schema migration requires a transaction.', 1;

                IF EXISTS (SELECT 1 FROM [dbo].[MedicalRecords] WITH (TABLOCKX, HOLDLOCK))
                    THROW 51061, 'MedicalRecords must be empty; a reviewed legacy-data plan is required.', 1;
                IF EXISTS (SELECT 1 FROM [dbo].[Prescriptions] WITH (TABLOCKX, HOLDLOCK))
                    THROW 51062, 'Prescriptions must be empty; a reviewed legacy-data plan is required.', 1;
                IF EXISTS (SELECT 1 FROM [dbo].[PrescriptionItems] WITH (TABLOCKX, HOLDLOCK))
                    THROW 51063, 'PrescriptionItems must be empty; a reviewed legacy-data plan is required.', 1;
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_MedicalRecords_Appointments_AppointmentId",
                table: "MedicalRecords");

            migrationBuilder.DropForeignKey(
                name: "FK_PrescriptionItems_Prescriptions_PrescriptionId",
                table: "PrescriptionItems");

            migrationBuilder.DropForeignKey(
                name: "FK_Prescriptions_MedicalRecords_MedicalRecordId",
                table: "Prescriptions");

            migrationBuilder.DropIndex(
                name: "IX_PrescriptionItems_PrescriptionId",
                table: "PrescriptionItems");

            migrationBuilder.AlterColumn<string>(
                name: "Notes",
                table: "Prescriptions",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "Prescriptions",
                type: "datetime2(7)",
                nullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "MedicineName",
                table: "PrescriptionItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Instructions",
                table: "PrescriptionItems",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "Frequency",
                table: "PrescriptionItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Duration",
                table: "PrescriptionItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AlterColumn<string>(
                name: "Dosage",
                table: "PrescriptionItems",
                type: "nvarchar(200)",
                maxLength: 200,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "nvarchar(max)");

            migrationBuilder.AddColumn<int>(
                name: "Position",
                table: "PrescriptionItems",
                type: "int",
                nullable: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Quantity",
                table: "PrescriptionItems",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: false);

            migrationBuilder.AddColumn<string>(
                name: "QuantityUnit",
                table: "PrescriptionItems",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: false);

            migrationBuilder.AlterColumn<string>(
                name: "ChiefComplaint",
                table: "MedicalRecords",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(2000)",
                oldMaxLength: 2000);

            migrationBuilder.AlterColumn<string>(
                name: "Diagnosis",
                table: "MedicalRecords",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(2000)",
                oldMaxLength: 2000);

            migrationBuilder.AddColumn<DateTime>(
                name: "FinalizedAt",
                table: "MedicalRecords",
                type: "datetime2(7)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FinalizedByUserId",
                table: "MedicalRecords",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "MedicalRecords",
                type: "rowversion",
                rowVersion: true,
                nullable: false);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                table: "MedicalRecords",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_Appointments_Id_PatientProfileId_DoctorId",
                table: "Appointments",
                columns: new[] { "Id", "PatientProfileId", "DoctorId" })
                .Annotation("SqlServer:Clustered", false);

            migrationBuilder.CreateTable(
                name: "ClinicalAuditEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MedicalRecordId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ActorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    OccurredAt = table.Column<DateTime>(type: "datetime2(7)", nullable: false),
                    CorrelationId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    PreviousRecordVersion = table.Column<byte[]>(type: "binary(8)", fixedLength: true, maxLength: 8, nullable: true),
                    NewRecordVersion = table.Column<byte[]>(type: "binary(8)", fixedLength: true, maxLength: 8, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicalAuditEvents", x => x.Id);
                    table.CheckConstraint("CK_ClinicalAuditEvents_RequiredText", "LEN(LTRIM(RTRIM([Action]))) > 0 AND LEN(LTRIM(RTRIM([CorrelationId]))) > 0");
                    table.ForeignKey(
                        name: "FK_ClinicalAuditEvents_MedicalRecords_MedicalRecordId",
                        column: x => x.MedicalRecordId,
                        principalTable: "MedicalRecords",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_ClinicalAuditEvents_Users_ActorUserId",
                        column: x => x.ActorUserId,
                        principalTable: "Users",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrescriptionItems_PrescriptionId_Position",
                table: "PrescriptionItems",
                columns: new[] { "PrescriptionId", "Position" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_PrescriptionItems_Position_Positive",
                table: "PrescriptionItems",
                sql: "[Position] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PrescriptionItems_Quantity_Positive",
                table: "PrescriptionItems",
                sql: "[Quantity] > 0");

            migrationBuilder.AddCheckConstraint(
                name: "CK_PrescriptionItems_RequiredText",
                table: "PrescriptionItems",
                sql: "LEN(LTRIM(RTRIM([MedicineName]))) > 0 AND LEN(LTRIM(RTRIM([Dosage]))) > 0 AND LEN(LTRIM(RTRIM([Frequency]))) > 0 AND LEN(LTRIM(RTRIM([Duration]))) > 0 AND LEN(LTRIM(RTRIM([QuantityUnit]))) > 0");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalRecords_AppointmentId_PatientProfileId_DoctorId",
                table: "MedicalRecords",
                columns: new[] { "AppointmentId", "PatientProfileId", "DoctorId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalRecords_FinalizedByUserId",
                table: "MedicalRecords",
                column: "FinalizedByUserId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MedicalRecords_FinalizationLifecycle",
                table: "MedicalRecords",
                sql: "([Status] = N'Draft' AND [FinalizedAt] IS NULL AND [FinalizedByUserId] IS NULL) OR ([Status] = N'Finalized' AND [FinalizedAt] IS NOT NULL AND [FinalizedByUserId] IS NOT NULL AND [ChiefComplaint] IS NOT NULL AND LEN(LTRIM(RTRIM([ChiefComplaint]))) > 0 AND [Diagnosis] IS NOT NULL AND LEN(LTRIM(RTRIM([Diagnosis]))) > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_MedicalRecords_Status",
                table: "MedicalRecords",
                sql: "[Status] IN (N'Draft', N'Finalized')");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicalAuditEvents_ActorUserId",
                table: "ClinicalAuditEvents",
                column: "ActorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicalAuditEvents_MedicalRecordId_OccurredAt_Id",
                table: "ClinicalAuditEvents",
                columns: new[] { "MedicalRecordId", "OccurredAt", "Id" });

            migrationBuilder.AddForeignKey(
                name: "FK_MedicalRecords_Appointments_AppointmentId_PatientProfileId_DoctorId",
                table: "MedicalRecords",
                columns: new[] { "AppointmentId", "PatientProfileId", "DoctorId" },
                principalTable: "Appointments",
                principalColumns: new[] { "Id", "PatientProfileId", "DoctorId" });

            migrationBuilder.AddForeignKey(
                name: "FK_MedicalRecords_Users_FinalizedByUserId",
                table: "MedicalRecords",
                column: "FinalizedByUserId",
                principalTable: "Users",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_PrescriptionItems_Prescriptions_PrescriptionId",
                table: "PrescriptionItems",
                column: "PrescriptionId",
                principalTable: "Prescriptions",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Prescriptions_MedicalRecords_MedicalRecordId",
                table: "Prescriptions",
                column: "MedicalRecordId",
                principalTable: "MedicalRecords",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Automatic rollback would discard clinical/audit history and restore
            // cascade deletes. It is intentionally blocked even when tables are empty.
            // A separately reviewed recovery migration is required.
            migrationBuilder.Sql("""
                THROW 51064, 'Automatic clinical schema rollback is blocked; use a separately reviewed recovery plan.', 1;
                """);
        }
    }
}
