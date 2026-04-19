"""
S3 helpers for the layout engine.
Downloads input KMZ from S3; uploads layout.kmz, layout.svg, layout.dxf.
"""
import os

import boto3


def _client():
    return boto3.client(
        "s3",
        region_name=os.environ.get("AWS_REGION", "ap-south-1"),
    )


def download_from_s3(bucket: str, key: str, local_path: str) -> None:
    """Download an S3 object to a local file path."""
    _client().download_file(bucket, key, local_path)


def upload_to_s3(bucket: str, local_path: str, key: str) -> None:
    """Upload a local file to S3 at the given key."""
    _client().upload_file(local_path, bucket, key)
