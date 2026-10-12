using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace HIS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddQueueEntryRowVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte[]>(
                name: "RowVersion",
                table: "QueueEntries",
                type: "rowversion",
                rowVersion: true,
                nullable: false,
                defaultValue: new byte[0]);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RowVersion",
                table: "QueueEntries");
        }
    }
}
