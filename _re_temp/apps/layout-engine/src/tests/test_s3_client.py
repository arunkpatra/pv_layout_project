from unittest.mock import MagicMock, patch

from s3_client import download_from_s3, upload_to_s3


def test_download_from_s3_calls_boto3_correctly():
    mock_s3 = MagicMock()
    with patch("s3_client.boto3.client", return_value=mock_s3):
        download_from_s3(
            bucket="my-bucket",
            key="projects/p1/versions/v1/input.kmz",
            local_path="/tmp/input.kmz",
        )
    mock_s3.download_file.assert_called_once_with(
        "my-bucket",
        "projects/p1/versions/v1/input.kmz",
        "/tmp/input.kmz",
    )


def test_upload_to_s3_calls_boto3_correctly():
    mock_s3 = MagicMock()
    with patch("s3_client.boto3.client", return_value=mock_s3):
        upload_to_s3(
            bucket="my-bucket",
            local_path="/tmp/layout.svg",
            key="projects/p1/versions/v1/layout.svg",
        )
    mock_s3.upload_file.assert_called_once_with(
        "/tmp/layout.svg",
        "my-bucket",
        "projects/p1/versions/v1/layout.svg",
    )
